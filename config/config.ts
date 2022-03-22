import * as R from "ramda"

export const getConfig = () => {
  const tgServerIP = process.env.TG_SERVER_IP
  const tgServerPort = parseInt(process.env.TG_SERVER_PORT || '')
  const tgDCId = parseInt(process.env.TG_DC_ID || '')

  const phoneNumber = process.env.USER_PHONE_NUMBER
  const password = process.env.USER_PASSWORD

  const apiId = parseInt(process.env.TG_API_ID || '')
  const apiHash = process.env.TG_API_HASH

  if (R.isNil(tgServerIP) || isNaN(tgServerPort) || isNaN(tgDCId)) {
    process.exit(202)
  }

  if (R.isNil(phoneNumber) || R.isNil(password)) {
    process.exit(203)
  }

  if (isNaN(apiId) || R.isNil(apiHash)) {
    process.exit(204)
  }

  return {
    ip: tgServerIP,
    port: tgServerPort,
    dcId: tgDCId,
    number: phoneNumber,
    password: password,
    apiId: apiId,
    apiHash: apiHash
  }
}
