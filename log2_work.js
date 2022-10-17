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

  await onHashBlock(bestBlockHash)
  process.exit(0)

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

    fs.writeFileSync('image.png', buffer)

    // var media = twitter.postMediaUpload(buffer)
    // twitter.postStatus(text, media.media_id_string);

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

/*
For block 632874 the logs show log2_work=92.000014.

This is just over 2^92. The chainwork field in hex says 10000a7fafa3521b17719464.

In decimal this is 4951809736198896811313828964.

In binary this is a 1 with 92 digits. If log2_work is 93, the binary number is one longer.



Everyone seems to have missed this.

With block 693599, on 2021-07-31, the expected cumulative work in the Bitcoin blockchain surpassed 2^93 double-SHA256 hashes (no idea how to calculate the standard deviation).

#9903520314283042199192993792hashes



I had missed this.

With block 632874, around a day ago, the expected cumulative work in the Bitcoin blockchain surpassed 2^92 double-SHA256 hashes (with a standard deviation around 1.4*2^83).

#4951760157141521099596496896hashes
*/