import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import { env } from "../../config/env.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

/**
 * Reusable Multer + Cloudinary Uploader Factory
 */
const createUploader = (options: {
  getFolder: (req: any) => string;
  maxSizeMB: number;
  stripExif?: boolean;
}) => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req: any) => ({
      folder: options.getFolder(req),
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [
        {
          quality: "auto",
          fetch_format: "auto",
          ...(options.stripExif ? { flags: "strip_profile" } : {}),
        },
      ],
    }),
  });

  return multer({
    storage,
    limits: { fileSize: options.maxSizeMB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Unsupported file format. Only JPEG, PNG, and WebP are allowed."));
      }
    },
  });
};

// 1. User Profile Avatars & Cover Photos (Stored in tvtrac_profiles)
export const upload = createUploader({
  getFolder: () => "tvtrac_profiles",
  maxSizeMB: 20,
});

// 2. Episode Discussion Media (Stored in tvtrac_discussions/{userId}, stripped EXIF, max 10MB)
export const uploadDiscussionMedia = createUploader({
  getFolder: (req) => `tvtrac_discussions/${req.user?.userId || "unknown"}`,
  maxSizeMB: 10,
  stripExif: true,
});

export { cloudinary };
