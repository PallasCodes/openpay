const Openpay = require('openpay')
const pdf = require('html-pdf')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

const { sequelize, gbplus } = require('./db')
const { readTxtFile } = require('./readTxt')

const report = require('./report')
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

let openpay

if (process.env.IS_PRODUCTION === 'true') {
  openpay = new Openpay(process.env.MERCHANT_ID, process.env.PRIVATE_KEY, [
    true,
  ])
} else {
  openpay = new Openpay(
    process.env.MERCHANT_ID_TESTING,
    process.env.PRIVATE_KEY_TESTING,
  )
}

let NUM_CARGOS_GENERADOS = 0
let NUM_CARGOS_ERROR = 0
let NUM_CARGOS_SIN_EMAIL = 0

async function registerCharge(payload) {
  await gbplus.query(`
    INSERT INTO web.eventoOpenpay (idOrden, idTransaccion)
    VALUES (${payload.idOrden}, '${payload.idTransaccionOP}')
  `)
}

async function getBarCode(chargePayload) {
  return new Promise((resolve, reject) => {
    try {
      openpay.charges.create(chargePayload, (error, body) => {
        if (error) {
          NUM_CARGOS_ERROR += 1
          return reject(error)
        }

        NUM_CARGOS_GENERADOS += 1
        return resolve(body)
      })
    } catch (error) {
      console.error(error)
      throw new Error(error)
    }
  })
}

async function generateBarCode(chargePayload) {
  const payloadOP = {
    method: 'store',
    amount: chargePayload.saldoVencidoRea,
    description: `Saldo vencido ${chargePayload.folioInterno}`,
    customer: {
      name: chargePayload.nombreCliente.toUpperCase(),
      email: chargePayload.email,
      phone_number: chargePayload.telefonoFijo,
    },
  }

  try {
    const result = await getBarCode(payloadOP)
    console.log('🚀 ~ generateBarCode ~ result:', result)

    const payload = {
      folioInterno: chargePayload.folioInterno,
      idOrden: chargePayload.idOrden,
      montoPagar: chargePayload.saldoVencidoRea,
      tiempoCreacion: new Date()
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19),
      urlCodigoBarras: result?.payment_method?.barcode_url,
      urlPdf: result?.payment_method?.url_store,
      idTransaccionOP: result?.id,
      referencia: result?.payment_method?.reference,
    }

    await registerCharge(payload)

    const fechaLimite = new Date(
      new Date().getTime() + 2592000000,
    ).toLocaleDateString('mx-SP')

    const reportContent = report({
      saldoVencidoRea: payload.montoPagar,
      referencia: payload.referencia,
      imgUrl: payload.urlCodigoBarras,
      fechaLimite,
    })

    const options = {
      border: {
        top: '30px',
        bottom: '30px',
        left: 0,
        right: 0,
      },
    }

    pdf.create(reportContent, options).toBuffer(async (err, buffer) => {
      if (err) {
        return null
      }

      const params = {
        Bucket: 'gbplus.inter3.testing',
        Key: `paynet/${chargePayload.idOrden}_op.pdf`,
        Body: buffer,
        ContentType: 'application/pdf',
        ACL: 'public-read',
      }

      try {
        const command = new PutObjectCommand(params)
        await s3.send(command)
      } catch (error) {
        console.error(error)
      }
    })
  } catch (error) {
    console.error(error)
  }
}

async function generateAllBarCodes() {
  NUM_CARGOS_ERROR = 0
  NUM_CARGOS_GENERADOS = 0
  NUM_CARGOS_SIN_EMAIL = 0

  const query = await readTxtFile('./query.txt')

  const [results] = await sequelize.query(query)

  console.info(`Total de cargos a generar: ${results.length}`)

  for (let i = 0; i < results.length; i += 50) {
    const promises = []

    for (let j = 0; j < 50; j += 1) {
      if (results[i + j]?.email) {
        console.info(
          `Generando cargo ${i + j + 1} de ${results.length} - idOrden: ${
            results[i + j].idOrden
          }`,
        )

        const saldoVencidoReal = Number(
          results[i + j].saldoVencidoRea.toFixed(2),
        )

        const payload = {
          ...results[i + j],
          saldoVencidoRea: saldoVencidoReal > 29999 ? 29998 : saldoVencidoReal,
        }

        promises.push(generateBarCode(payload))
      } else {
        NUM_CARGOS_SIN_EMAIL += 1
      }

      await Promise.allSettled(promises)
    }
  }

  return {
    NUM_CARGOS_ERROR,
    NUM_CARGOS_GENERADOS,
    NUM_CARGOS_SIN_EMAIL,
  }
}

function generateMultipleBarcodes(chargePayload) {
  let adeudo = chargePayload.saldoVencidoRea
  const promises = []

  while (adeudo > 0) {
    let saldoVencidoRea

    if (adeudo >= 29998) {
      saldoVencidoRea = 29998
      adeudo -= 29998
    } else {
      saldoVencidoRea = adeudo
      adeudo = 0
    }

    const payload = {
      ...chargePayload,
      saldoVencidoRea: Number(saldoVencidoRea.toFixed(2)),
    }

    promises.push(generateBarCode(payload))
  }

  return promises
}

module.exports = {
  generateBarCode,
  generateAllBarCodes,
}
