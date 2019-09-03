var express = require('express');
var app = express();
var server = require('http').createServer(app);
var bodyParser = require('body-parser');
var config = {}; try {config=require('./config.json')} catch(err){};
var indexHTML = '';
var fs = require('fs');
fs.readFile('./index.html', (err,html)=>{indexHTML=html});
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
Album.prototype.getInfo = function(url) {
	if (url) {
		let img=this.index.find((i)=>{return url==i.url});
		if (img) {
			let copy=JSON.parse(JSON.stringify(img));
			copy.imagesize=img.data.length;
			copy.data=undefined;
			return JSON.stringify(copy);
		} else {return {}}
	} else if (this.index.length) {
		let count=this.index.length;
		let size=Math.round(this.index.reduce((a,c)=>{return a+c.data.length},0)/1000)+'kb';
		let requests=this.index.reduce((a,c)=>{return a+c.requests},0);
		let albumJSON = JSON.stringify(this.index.sort((a,b)=>{return (a.url>b.url)}).map((image)=>{ var rObj={}; rObj.url=image.url; rObj.title=image.title; rObj.timestamp=image.timestamp; rObj.requests=image.requests; rObj.imagesize=image.data.length; return rObj; }));
		return {"thumbnails":albumJSON,"count":count,"requests":requests,"size":size};
	} else {
		return {}
	}
}
function Image(data,url,title) {
	this.data = data;
	this.url = url;
	this.title = title;
	this.timestamp = Date.now();
	this.requests = 0;
}

app.use('('+config.subdir+')?/:first?/:second?', function (req, res) {
	res.contentType('text/html');
	switch (req.params.first) {

		case undefined:
		case 'index.html':
			res.send(indexHTML);
			break;

		case 'remove':
			album.removeImage(req.params.second);
		case 'info':
			res.send(album.getInfo(req.params.second));
			break;

		case 'init':
			let initHTML=config.initURLs?config.initURLs.reduce((a,c)=>{return a+='<img src='+encodeURIComponent(c)+'>'},'Initializing with '+config.initURLs.length+' sample URLs. Please wait and then <a href='+config.subdir+'/>reload</a>.<p>'):'no data - <a href=a/https%3A%2F%2Fgwelt.net%2Fsudoku>init</a>';
			res.send(initHTML);
			break;

		case 'update':
			album.removeImage(req.params.second);
			req.params.first=req.params.second;
		default:
			if (/^http.{8,}/i.test(req.params.first)) {
				let image=album.getImageByURL(req.params.first);
				if (image) {
					// serve thumbnail from cache
					image.requests++;
					res.contentType('image/png');
					res.send(image.data);
				} else {
					// create new thumbnail
					puppeteer_screenshot(req.params.first,(data,url,title)=>{
						if (data) {
							console.log('NEW THUMBNAIL: '+url+' TITLE: '+title+' SIZE: '+data.length);
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
			//console.log('NEW THUMBNAIL: '+url+' TITLE: '+title+' SIZE: '+data.length);
			callback(data,url,title);
		});
	} else {callback(undefined,undefined,undefined)}
}
