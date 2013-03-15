var tls = require('tls');
var net = require('net');
var events = require('events');
var util = require('util');

function Connection(options) {
	this.maxMessageSize = options && options.maxMessageSize || 1024*1024*32;

	var self = this;

	this.socket = new net.Socket;

	// Store the incoming message part
	this.messageBuf = null;
	this.writeIndex = 0;

	// SSL support
	this.readWriteStream = this.socket;
	if (options && options.ssl) {
		var pair = tls.createSecurePair(options.tlsCredentials);
		pair.encrypted.pipe(this.socket);
		this.socket.pipe(pair.encrypted);
		this.readWriteStream = pair.cleartext;
	}

	// Setup data listener
	this.readWriteStream.on('data', this.parse.bind(this));
	this.socket.on('connect', function() { self.emit('connect') });
	this.socket.on('error', function(message) { self.emit('error', message) });
	this.socket.on('close', function() { self.emit('close') });
}
util.inherits(Connection, events.EventEmitter);

Connection.prototype.parse = function parse(data){
	function createBuffer(size){
		if (size > this.maxMessageSize) {
			this.emit('error', new Error('message too large: ' + expectedMessageSize + ' (max=' + this.maxMessageSize + ')'));
			this.close();
			return;
		}
		return new Buffer(size);
	}

	var readIndex = 0;
	while(1){
		if(!this.messageBuf){
			if(0 && data.length>4){
				this.messageBuf = createBuffer(data.readUInt32LE(0));
			}else{
				this.messageBuf = new Buffer(4);
				this.messageBuf.fill(255);
			}
			this.writeIndex = 0;
		}
		if(this.messageBuf.length==4){
			var lenBuf = this.messageBuf;
			var copied = data.copy(lenBuf, this.writeIndex, readIndex);
			if(this.writeIndex+copied >= 4){
				// Allocate a bigger buffer
				this.messageBuf = createBuffer(lenBuf.readUInt32LE(0));
				lenBuf.copy(this.messageBuf);
			}
		}
		var copied = data.copy(this.messageBuf, this.writeIndex, readIndex);
		this.writeIndex += copied;
		readIndex += copied;
		if(this.writeIndex>=this.messageBuf.length && this.messageBuf.length>4){
			try{
				this.emit('message', this.messageBuf);
			}catch(e){
				this.emit('error', e);
				this.close();
			}
			this.messageBuf = null;
		}
		if(readIndex >= data.length) break;
	}
}

Connection.prototype.write = function write(buffer, callback) {
	this.readWriteStream.write(buffer, callback);
}

Connection.prototype.connect = function connect(port, host){
	this.socket.connect(port,host);
}

Connection.prototype.close = function close(){
	this.socket.end();
}

Connection.prototype.destroy = function destroy(){
	this.socket.destroy();
}

module.exports = Connection;
