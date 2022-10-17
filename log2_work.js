const zmq = require('zeromq');
const fs = require('fs');
const { createCanvas } = require('canvas');

const logger = require('./logger');
const config = require('./config');

const BitcoinRpc = require('./bitcoin-rpc.js');
const bitcoin_rpc =  new BitcoinRpc(config.bitcoind);

const Twitter = require('./twitter.js');
const twitter = new Twitter(config.twitter);

var current_exponent = 0;

(async function () {
  logger.log('init')

  const networkInfo = await bitcoin_rpc.getNetworkInfo()
  logger.log(`connected to Bitcoin Core ${networkInfo.subversion} on ${config.bitcoind.host}:${config.bitcoind.zmqport}`)

  var bestBlockHash = await bitcoin_rpc.getBestBlockHash()
  var bestBlock = await bitcoin_rpc.getBlock(bestBlockHash)

  var chainwork = new Chainwork(bestBlock.chainwork)
  logger.log(`height=${bestBlock.height} log2_work=${chainwork.log2_work}`)

  current_exponent = chainwork.exponent

  var sock = zmq.socket('sub')
  var addr = `tcp://${config.bitcoind.host}:${config.bitcoind.zmqport}`

  sock.connect(addr)
  sock.subscribe('hashblock')
  sock.on('message', async function (topic, message) {
    if (topic.toString() === 'hashblock') {
      onHashBlock(message.toString('hex'))
    } else {
      logger.log(topic)
    }
  })
})()

async function onHashBlock(hash) {
  var block = await bitcoin_rpc.getBlock(hash)

  var chainwork = new Chainwork(block.chainwork)

  logger.log(`height=${block.height} log2_work=${chainwork.log2_work}`)

  if (chainwork.exponent > current_exponent) {
    var text = 
`With block ${block.height}, the expected cumulative work in the Bitcoin blockchain surpassed 2^${chainwork.exponent} double-SHA256 hashes.

#${chainwork.value.toString(10)}hashes

log2_work: ${chainwork.log2_work}
hex: 0x${chainwork.value.toString(16)}`
  
    var binary = splice(chainwork.value.toString(2), 8)
    var buffer = createImage(binary)

    var media = twitter.postMediaUpload(buffer)
    twitter.postStatus(text, media.media_id_string);

    current_exponent = chainwork.exponent
  }
}

function splice(binary, gap) {
  var result = []
  for (var i = binary.length - gap; i > 0; i -= gap) {
    result.push(binary.substring(i, i + gap))
  }
  result.push(binary.substring(0, i + gap))

  return result.reverse().join(' ')
}

function Chainwork(chainwork) {
  this.value = BigInt(`0x${chainwork}`)
  this.log2_work = Math.log2(this.value.toString(10)).toFixed(6)
  this.exponent = this.value.toString(2).length - 1

  this.toString = () => `${this.log2_work}`
}

function createImage(text) {
  const canvas = createCanvas(1200, 600)
  const ctx = canvas.getContext('2d')

  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.fill();

  const cx = canvas.width / 2
  const cy = canvas.height / 2

  ctx.imageSmoothingEnabled = true

  var fontSize = 200;

  do {
    fontSize -= 1
    ctx.font = `${(fontSize / 10)}px DejaVu Sans Mono`
    var measure = ctx.measureText(text)
  } while (measure.width > canvas.width)

  ctx.fillStyle = 'black'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, cx, cy)

  return canvas.toBuffer();
}
