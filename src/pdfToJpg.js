const os = require('os')
const path = require('path')
const fs = require('fs')
const { pdfToPng } = require('pdf-to-png-converter')

async function convertPdfToImage(pdfBuffer) {
  try {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-img-'))

    const opciones = {
      viewportScale: 2.0,
      outputFolder: tempDir, // 👈 Folder temporal real
      outputFileMask: 'buffer', // Este nombre da igual si solo quieres el buffer
      pagesToProcess: [1], // Solo si quieres la primera página
    }

    const paginasConvertidas = await pdfToPng(pdfBuffer, opciones)

    // Limpia el folder si deseas eliminar los archivos temporales (opcional)
    fs.rmSync(tempDir, { recursive: true, force: true })

    return paginasConvertidas.map((pagina) => ({
      pageNumber: pagina.pageNumber,
      content: pagina.content,
    }))
  } catch (error) {
    console.error('Error al convertir el PDF:', error)
    throw error
  }
}

module.exports = convertPdfToImage
