import { v2 as cloudinary } from 'cloudinary';
import fs from "fs"

const uploadOnCloudinary = async (filePath) => {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });

    try {
        const uploadResult = await cloudinary.uploader.upload(filePath)
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
        }
        return uploadResult.secure_url
    } catch (error) {
        console.log("Cloudinary upload error:", error)
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
        }
        // FIXED: Return null instead of using undefined 'res'
        return null
    }
}

export default uploadOnCloudinary