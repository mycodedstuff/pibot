import express from "express"
import multer from "multer"
import { Server } from "http"

export const initServer = (port: number, awaitingCode: (sever: Server, code: string) => void) => {
  const app = express()
  const multerInstance = multer()

  const server = app.listen(port, () => {
    console.log("Server started at port", port);
  })

  app.post("/", multerInstance.none(), (req, res) => {
    if (req.body?.code) {
      res.sendStatus(200)
      awaitingCode(server, req.body.code)
    } else {
      res.sendStatus(400)
    }
  })

  return server
}

export const stopServer = (app: Server): Promise<string | Error> => {
  return new Promise((resolve, reject) => {
    app.close((err) => {
      if (!err) {
        console.log("Server closed");
        resolve("Server closed")
      } else {
        console.error("Couldn't stop the server", err);
        reject(err)
      }
    })
  })
}
