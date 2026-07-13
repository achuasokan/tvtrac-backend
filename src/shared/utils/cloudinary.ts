import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import { env } from "../../config/env.js";


cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        return {
            folder: "tvtrac_profiles",
            allowed_formats: ["jpg", "jpeg", "png", "webp"],
            transformation: [
                { quality: "auto", fetch_format: "auto" }
            ],
        };
    },
});

export const upload = multer({ storage });
export { cloudinary };
