import express from "express"
import dotenv from "dotenv"
dotenv.config()
import connectDb from "./config/db.js"
import authRouter from "./routes/auth.routes.js"
import cors from "cors"
import cookieParser from "cookie-parser"
import userRouter from "./routes/user.routes.js"
import geminiResponse from "./gemini.js"
import fs from "fs"
import path from "path"

const app = express()

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}))

// FIXED: Changed port to 8000
const port = process.env.PORT || 8000

app.use(express.json())
app.use(cookieParser())

// FIXED: Create public folder if it doesn't exist
const publicDir = path.join(process.cwd(), 'public')
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true })
}

app.use("/api/auth", authRouter)
app.use("/api/user", userRouter)

app.listen(port, () => {
    connectDb()
    console.log(`Server started on port ${port}`)
})