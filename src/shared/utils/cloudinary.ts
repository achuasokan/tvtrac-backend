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

/**
 * Upload a raw non-image file (CSV, JSON) buffer to Cloudinary
 */
export const uploadRawToCloudinary = async (
  buffer: Buffer,
  originalFilename: string,
  folder = "tvtrac_imports"
): Promise<{ publicId: string; secureUrl: string }> => {
  return new Promise((resolve, reject) => {
    const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const publicId = `${folder}/${uniqueSuffix}_${safeName}`;

    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        public_id: publicId,
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error("Failed to upload raw file to Cloudinary"));
        }
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
        });
      }
    );

    stream.end(buffer);
  });
};

/**
 * Delete a temporary raw file from Cloudinary (idempotent & safe)
 */
export const deleteRawFromCloudinary = async (publicId: string): Promise<void> => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
  } catch (error) {
    console.error("[Cloudinary] Failed to delete temporary raw file:", publicId, error);
  }
};

/**
 * Multer memory storage uploader for TV Time import files (CSV/JSON)
 */
export const uploadTvTimeFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file limit
  fileFilter: (req, file, cb) => {
    const lowerName = file.originalname.toLowerCase();
    const isCsvOrJson =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/json" ||
      file.mimetype === "text/plain" ||
      file.mimetype === "application/octet-stream" ||
      lowerName.endsWith(".csv") ||
      lowerName.endsWith(".json");

    if (isCsvOrJson) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.originalname}. Only CSV and JSON files are supported.`));
    }
  },
});

export { cloudinary };

