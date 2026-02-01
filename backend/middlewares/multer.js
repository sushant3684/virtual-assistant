import multer from "multer"
import fs from "fs"
import path from "path"

const publicDir = "./public"
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true })
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, publicDir)
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        const ext = path.extname(file.originalname)
        const name = path.basename(file.originalname, ext)
        cb(null, `${name}-${uniqueSuffix}${ext}`)
    }
})

const upload = multer({ storage })
export default upload