import {
  convertBigIntToByteArray,
  decompressByteArray,
  splitToWords,
} from './utils'
import { AnonAadhaarArgs, FieldsToRevealArray } from './types'
import {
  bufferToHex,
  Uint8ArrayToCharArray,
} from '@zk-email/helpers/dist/binary-format'
import { sha256Pad } from '@zk-email/helpers/dist/sha-utils'
import { Buffer } from 'buffer'
import { pki } from 'node-forge'
import { ArgumentTypeName } from '@pcd/pcd-types'
import { hash } from './hash'

interface GenerateArgsOptions {
  qrData: string
  certificateFile: string
  nullifierSeed: number
  fieldsToRevealArray?: FieldsToRevealArray
  signal?: string
}

/**
 * Extract all the information needed to generate the witness from the QRCode data.
 * @param qrData QrCode Data
 * @returns {witness}
 */
export const generateArgs = async ({
  qrData,
  certificateFile,
  nullifierSeed,
  fieldsToRevealArray,
  signal,
}: GenerateArgsOptions): Promise<AnonAadhaarArgs> => {
  const bigIntData = BigInt(qrData)

  const byteArray = convertBigIntToByteArray(bigIntData)

  const decompressedByteArray = decompressByteArray(byteArray)

  // Read signature data
  const signature = decompressedByteArray.slice(
    decompressedByteArray.length - 256,
    decompressedByteArray.length
  )

  const signedData = decompressedByteArray.slice(
    0,
    decompressedByteArray.length - 256
  )

  const RSAPublicKey = pki.certificateFromPem(certificateFile).publicKey
  const publicKey = (RSAPublicKey as pki.rsa.PublicKey).n.toString(16)

  const pubKeyBigInt = BigInt('0x' + publicKey)

  const signatureBigint = BigInt(
    '0x' + bufferToHex(Buffer.from(signature)).toString()
  )

  const [paddedMessage, messageLength] = sha256Pad(signedData, 512 * 3)

  const delimiterIndices: number[] = []
  for (let i = 0; i < paddedMessage.length; i++) {
    if (paddedMessage[i] === 255) {
      delimiterIndices.push(i)
    }
    if (delimiterIndices.length === 18) {
      break
    }
  }

  if (!fieldsToRevealArray) fieldsToRevealArray = []

  const fieldsToReveal = {
    revealGender: fieldsToRevealArray.includes('revealGender'),
    revealAgeAbove18: fieldsToRevealArray.includes('revealAgeAbove18'),
    revealState: fieldsToRevealArray.includes('revealState'),
    revealPinCode: fieldsToRevealArray.includes('revealPinCode'),
  }

  // Set signal to 1 by default if no signal setted up
  const signalHash = signal ? hash(signal) : hash(1)

  const anonAadhaarArgs: AnonAadhaarArgs = {
    qrDataPadded: {
      argumentType: ArgumentTypeName.StringArray,
      value: Uint8ArrayToCharArray(paddedMessage),
    },
    qrDataPaddedLength: {
      argumentType: ArgumentTypeName.Number,
      value: messageLength.toString(),
    },
    nonPaddedDataLength: {
      argumentType: ArgumentTypeName.Number,
      value: signedData.length.toString(),
    },
    delimiterIndices: {
      argumentType: ArgumentTypeName.StringArray,
      value: delimiterIndices.map(elem => elem.toString()),
    },
    signature: {
      argumentType: ArgumentTypeName.StringArray,
      value: splitToWords(signatureBigint, BigInt(121), BigInt(17)),
    },
    pubKey: {
      argumentType: ArgumentTypeName.StringArray,
      value: splitToWords(pubKeyBigInt, BigInt(121), BigInt(17)),
    },
    nullifierSeed: {
      argumentType: ArgumentTypeName.String,
      value: nullifierSeed.toString(),
    },
    signalHash: {
      argumentType: ArgumentTypeName.String,
      value: signalHash,
    },
    revealGender: {
      argumentType: ArgumentTypeName.Number,
      value: fieldsToReveal.revealGender ? '1' : '0',
    },
    revealAgeAbove18: {
      argumentType: ArgumentTypeName.Number,
      value: fieldsToReveal.revealAgeAbove18 ? '1' : '0',
    },
    revealState: {
      argumentType: ArgumentTypeName.Number,
      value: fieldsToReveal.revealState ? '1' : '0',
    },
    revealPinCode: {
      argumentType: ArgumentTypeName.Number,
      value: fieldsToReveal.revealPinCode ? '1' : '0',
    },
  }

  return anonAadhaarArgs
}
