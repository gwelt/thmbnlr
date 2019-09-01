var express = require('express');
var app = express();
var server = require('http').createServer(app);
var bodyParser = require('body-parser');
var config = {}; try {config=require('./config.json')} catch(err){};
var port = process.env.PORT || config.port || 3000;
server.listen(port, function () { console.log('SERVER LISTENING ON PORT '+port+' (http://localhost:'+port+')')});
const puppeteer = require('puppeteer');
const sharp = require('sharp');
sharp.cache(false);

var album=new Album();
function Album() {
	this.index = [];
}
Album.prototype.newImage = function(data,url,title) {
	this.removeImage(url);
	let newImage = new Image(data,url,title);
	this.index.push(newImage);
	return newImage;	
}
Album.prototype.removeImage = function(url) {
	this.index=this.index.filter((i)=>{return i.url!==url});
	return this;
}
Album.prototype.getImageByURL = function(url) {
	return this.index.find((i)=>{return i.url==url});
}
Album.prototype.getImageByTimestamp = function(t) {
	return this.index.find((i)=>{return i.timestamp==t});
}
Album.prototype.getRandomImage = function() {
	if (!this.index.length) {return undefined} else {
		return this.index[Math.floor(Math.random() * Math.floor(this.index.length))];
	}
}
Album.prototype.getInfo = function() {
	let count=this.index.length;
	let size=Math.round(this.index.reduce((a,c)=>{return a+c.data.length},0)/1000)+'kb';
	let requests=this.index.reduce((a,c)=>{return a+c.requests},0);
	let albumJSON = JSON.stringify(this.index.map((image)=>{ var rObj={}; rObj.url=image.url; rObj.title=image.title; rObj.timestamp=image.timestamp; rObj.imagesize=image.data.length; return rObj; }));
	return {"info":albumJSON,"count":count,"requests":requests,"size":size};
}
Album.prototype.getHTMLLinkList = function() {
	return this.index.sort((a,b)=>{return (a.url>b.url)}).reduce((a,c)=>{return a+'<li>'+generate_HTML_image_info_snippet(c)+'</li>'},'<ul>')+'</ul>';
}
function Image(data,url,title) {
	this.data = data;
	this.url = url;
	this.title = title;
	this.timestamp = Date.now();
	this.requests = 0;
}

app.use('('+config.subdir+')?/:first?/:second?', function (req, res) {
	switch (req.params.first) {

		case undefined:
		case 'a':
			if (/^http/i.test(req.params.second)) {
				// get image by URL
				if (album.getImageByURL(req.params.second)) {
					let image=album.getImageByURL(req.params.second);
					res.send(generate_HTML(image,'from cache'));
				} else {
					puppeteer_screenshot(req.params.second,(data,url,title)=>{
						if (data) {
							let image=album.newImage(data,url,title);
							res.send(generate_HTML(image,'new thumbnail created'));
						} else {res.status(404).send('not found - could not create thumbnail')}
					});
				}			
			} else {
				if (album.getRandomImage()) {
					let image=album.getRandomImage();
					res.send(generate_HTML(image,'random thumbnail'));
				} else {
					let initHTML=config.initURLs?config.initURLs.reduce((a,c)=>{return a+='<img src='+encodeURIComponent(c)+'>'},'Initializing with '+config.initURLs.length+' sample URLs. Please wait and then <a href='+config.subdir+'/>reload</a>.<p>'):'no data - <a href=a/https%3A%2F%2Fgwelt.net%2Fsudoku>init</a>';
					res.status(404).send(initHTML);
				}
			}
			break;

		case 'remove':
			album.removeImage(req.params.second);
		case 'info':
			res.send(album.getInfo());
			break;

		case 'update':
			album.removeImage(req.params.second);
			req.params.first=req.params.second;

		default:
			if (/^http/i.test(req.params.first)) {
				// get image by URL
				let image=album.getImageByURL(req.params.first);
				if (image) {
					image.requests++;
					res.contentType('image/png');
					res.send(image.data);
				} else {
					puppeteer_screenshot(req.params.first,(data,url,title)=>{
						if (data) {
							let image=album.newImage(data,url,title);
							image.requests++;
							res.contentType('image/png');
							res.send(image.data);
						} else {res.status(404).send('not found - could not create thumbnail')}
					});
				}			
			} else {res.status(404).send('not found')}
			break;

	}
});

function generate_HTML(image,text) {
	let stats=album.getInfo();
	let form='<script>function send(){location.href="'+config.subdir+'/a/"+encodeURIComponent(document.getElementById("url").value);}</script><input id=url placeholder="URL with http:// or https://" value="https://"><button onclick=send()>capture thumbnail</button>';
	return '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd"><html><head><title>thmbnlr</title></head><body><code><h3><a href='+config.subdir+'/>thmbnlr</a></h3><a href='+image.url+'><img style="height:'+config.thumbnailOptions.height+'px" src='+config.subdir+'/'+encodeURIComponent(image.url)+'></a><p>'+generate_HTML_image_info_snippet(image)+'<!--<br>'+text+'--><p>'+form+'<hr>'+album.getHTMLLinkList()+'<hr>'+stats.count+' thumbnails, '+stats.size+', '+stats.requests+' requests [<a href='+config.subdir+'/info>JSON</a>]</code></body></html>';
}
function generate_HTML_image_info_snippet(image) {
	return '<a href='+config.subdir+'/a/'+encodeURIComponent(image.url)+'>'+image.url+'</a> [<a href='+image.url+'>visit</a>] [<a href='+config.subdir+'/'+encodeURIComponent(image.url)+'>PNG</a>] [<a href='+config.subdir+'/update/'+encodeURIComponent(image.url)+'>update</a>] [<a href='+config.subdir+'/remove/'+encodeURIComponent(image.url)+'>remove</a>] | '+image.title+' | '+image.data.length+' byte | '+image.requests+' requests | age '+Math.ceil((Date.now()-image.timestamp)/3600000)+' h';
}

async function puppeteer_screenshot(url,callback) {
	let error=false;
	const browser = await puppeteer.launch(config.browserOptions)
	const page = await browser.newPage()
	await page.setViewport(config.viewPort)
	await page.goto(url, {waitUntil: 'networkidle2'}).catch((err) => {error=true});
	const title = await page.title().catch((err) => {error=true});
	await page.screenshot(config.screenshotOptions).catch((err) => {error=true});
	await browser.close().catch((err) => {error=true});
	if (!error) {
		sharp(config.screenshotOptions.path).resize(config.thumbnailOptions).sharpen().png().toBuffer((err,data,info)=>{
			console.log('NEW SCREENSHOT/THUMBNAIL: '+url+' TITLE: '+title);
			callback(data,url,title);
		});
	} else {callback()}
}
