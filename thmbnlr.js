var express = require('express');
var app = express();
var server = require('http').createServer(app);
var bodyParser = require('body-parser');
var config = {}; try {config=require('./config.json')} catch(err){};
var path = require('path');
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
		// return info for image
		let img=this.index.find((i)=>{return url==i.url});
		if (img) {
			let copy=JSON.parse(JSON.stringify(img));
			copy.imagesize=img.data?img.data.length:0;
			copy.data=undefined;
			return JSON.stringify(copy);
		} else {return {}}
	} else {
		// create album with config.initURLs if album is empty
		if (!this.index.length) {config.initURLs?config.initURLs.forEach((i)=>{this.newImage(undefined,i,i)}):0} 
		// return info for album
		let count=this.index.length;
		let size=Math.round(this.index.reduce((a,c)=>{return a+c.data?c.data.length:0},0)/1000)+'kb';
		let requests=this.index.reduce((a,c)=>{return a+c.requests},0);
		let albumJSON = JSON.stringify(this.index.sort((a,b)=>{return (a.url>b.url)?1:((a.url<b.url)?-1:0)}).map((image)=>{ var rObj={}; rObj.url=image.url; rObj.title=image.title; rObj.timestamp=image.timestamp; rObj.requests=image.requests; rObj.imagesize=image.data?image.data.length:0; return rObj; }));
		return {"thumbnails":albumJSON,"count":count,"requests":requests,"size":size};
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
			res.sendFile(path.join(__dirname + '/index.html'));
			break;

		case 'remove':
			album.removeImage(req.params.second);
		case 'info':
			res.send(album.getInfo(req.params.second));
			break;

		case 'update':
			album.removeImage(req.params.second);
			req.params.first=req.params.second;
		default:
			if (/^http.{8,}/i.test(req.params.first)) {
				let image=album.getImageByURL(req.params.first);
				if (image&&image.data) {
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
