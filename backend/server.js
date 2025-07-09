require("dotenv").config(); // Load environment variables

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const cors = require("cors");
const mm = require("music-metadata");
const crypto = require("crypto");
const { normalizeFilename } = require("./utils");

const app = express();
const PORT = process.env.PORT || 3666;

// Middleware
app.use(cors());
app.use(express.json());

console.log("UPLOAD_DIR", process.env.UPLOAD_DIR);

// Cấu hình đường dẫn upload linh hoạt
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, "uploads");

const COVERS_DIR = path.join(UPLOAD_DIR, "covers");
const MUSIC_LIST_FILE = path.join(UPLOAD_DIR, "music-list.json");

// Log thông tin đường dẫn
console.log("=== STORAGE CONFIGURATION ===");
console.log(`Upload Directory: ${UPLOAD_DIR}`);
console.log(`Covers Directory: ${COVERS_DIR}`);
console.log(`Music List File: ${MUSIC_LIST_FILE}`);
console.log(`Is External Storage: ${!UPLOAD_DIR.includes(__dirname)}`);
console.log("===============================");

// Hàm tạo thư mục an toàn
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
    console.log(`✓ Directory exists: ${dirPath}`);
  } catch (error) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      console.log(`✓ Created directory: ${dirPath}`);
    } catch (mkdirError) {
      console.error(`✗ Failed to create directory ${dirPath}:`, mkdirError.message);
      throw mkdirError;
    }
  }
}

// Khởi tạo thư mục upload và covers
async function initializeDirectories() {
  try {
    await ensureDirectoryExists(UPLOAD_DIR);
    await ensureDirectoryExists(COVERS_DIR);

    // Test write permission
    const testFile = path.join(UPLOAD_DIR, ".write-test");
    await fs.writeFile(testFile, "test");
    await fs.unlink(testFile);

    console.log("✓ All directories initialized successfully");
    console.log("✓ Write permission confirmed");
  } catch (error) {
    console.error("✗ Failed to initialize directories:", error.message);
    console.error("Please check if the upload path exists and is writable.");
    process.exit(1);
  }
}

// Chạy khởi tạo thư mục
initializeDirectories();

// Serve static files từ thư mục uploads
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    setHeaders: (res, filePath) => {
      // Set proper headers cho audio files
      if (filePath.match(/\.(mp3|wav|flac|aac|ogg|webm|m4a)$/i)) {
        res.set({
          "Content-Type": "audio/mpeg",
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
        });
      }
      // Set proper headers cho image files
      else if (filePath.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        res.set({
          "Content-Type": "image/*",
          "Cache-Control": "public, max-age=86400", // Cache ảnh lâu hơn
        });
      }
    },
  })
);

// Cấu hình multer cho upload file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // Decode tên file từ latin1 sang utf8
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");

    // Chuẩn hóa tên file (loại bỏ dấu, thay space bằng -)
    const normalizedName = normalizeFilename(originalName);

    // Thêm timestamp để tránh trùng lặp
    const timestamp = Date.now();
    const finalName = `${timestamp}-${normalizedName}`;

    console.log(`Original: ${originalName} -> Normalized: ${finalName}`);

    cb(null, finalName);
  },
});

const fileFilter = (req, file, cb) => {
  // Chỉ chấp nhận file audio
  const allowedMimes = [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/flac",
    "audio/aac",
    "audio/ogg",
    "audio/webm",
  ];

  if (
    allowedMimes.includes(file.mimetype) ||
    file.originalname.match(/\.(mp3|wav|flac|aac|ogg|webm)$/i)
  ) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ chấp nhận file audio!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

// Utility function để format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// Hàm tạo URLs cho file
function generateFileUrls(filename, baseUrl = `http://localhost:${PORT}`) {
  const encodedId = Buffer.from(filename).toString("base64");
  return {
    streamUrl: `${baseUrl}/api/stream/${encodedId}`,
    directUrl: `${baseUrl}/uploads/${encodeURIComponent(filename)}`,
    downloadUrl: `${baseUrl}/api/download/${encodedId}`,
  };
}

// Hàm extract và lưu album art
async function extractAndSaveAlbumArt(filePath, filename) {
  try {
    const metadata = await mm.parseFile(filePath);

    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const picture = metadata.common.picture[0];

      // Tạo hash của filename để tạo tên file ảnh unique
      const hash = crypto.createHash("md5").update(filename).digest("hex");

      // Xác định extension từ mime type
      let extension = ".jpg"; // default
      if (picture.format.includes("png")) extension = ".png";
      else if (picture.format.includes("gif")) extension = ".gif";
      else if (picture.format.includes("webp")) extension = ".webp";

      const coverFilename = `${hash}${extension}`;
      const coverPath = path.join(COVERS_DIR, coverFilename);

      // Kiểm tra xem file ảnh đã tồn tại chưa
      if (!fsSync.existsSync(coverPath)) {
        await fs.writeFile(coverPath, picture.data);
        console.log(`Đã lưu album art: ${coverFilename}`);
      }

      return coverFilename;
    }

    return null;
  } catch (error) {
    console.error(`Lỗi extract album art cho ${filename}:`, error.message);
    return null;
  }
}

// Hàm tạo URL cho album art
function generateCoverUrl(coverFilename, baseUrl = `http://localhost:${PORT}`) {
  if (!coverFilename) return null;
  return `${baseUrl}/uploads/covers/${encodeURIComponent(coverFilename)}`;
}

// Hàm đọc metadata của file nhạc
async function extractMetadata(filePath, req = null) {
  try {
    const metadata = await mm.parseFile(filePath);
    const stats = await fs.stat(filePath);
    const filename = path.basename(filePath);

    // Tạo base URL từ request hoặc dùng default
    const baseUrl = req ? `${req.protocol}://${req.get("host")}` : `http://localhost:${PORT}`;
    const urls = generateFileUrls(filename, baseUrl);

    // Extract và lưu album art
    const coverFilename = await extractAndSaveAlbumArt(filePath, filename);
    const coverUrl = generateCoverUrl(coverFilename, baseUrl);

    return {
      filename: filename,
      title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
      artist: metadata.common.artist || "Unknown Artist",
      album: metadata.common.album || "Unknown Album",
      duration: metadata.format.duration || 0,
      bitrate: metadata.format.bitrate || 0,
      format: metadata.format.container || path.extname(filePath).slice(1),
      fileSize: stats.size,
      filePath: filePath,
      uploadDate: stats.birthtime || stats.ctime,
      // Thêm các URLs
      streamUrl: urls.streamUrl,
      directUrl: urls.directUrl,
      downloadUrl: urls.downloadUrl,
      // Thêm URL ảnh bìa
      coverUrl: coverUrl,
      coverFilename: coverFilename,
      // Thêm thông tin bổ sung từ metadata
      year: metadata.common.year || null,
      genre: metadata.common.genre ? metadata.common.genre.join(", ") : null,
      track: metadata.common.track ? metadata.common.track.no : null,
      albumartist: metadata.common.albumartist || null,
    };
  } catch (error) {
    console.error(`Lỗi đọc metadata cho ${filePath}:`, error.message);
    const stats = await fs.stat(filePath);
    const filename = path.basename(filePath);

    const baseUrl = req ? `${req.protocol}://${req.get("host")}` : `http://localhost:${PORT}`;
    const urls = generateFileUrls(filename, baseUrl);

    return {
      filename: filename,
      title: path.basename(filePath, path.extname(filePath)),
      artist: "Unknown Artist",
      album: "Unknown Album",
      duration: 0,
      bitrate: 0,
      format: path.extname(filePath).slice(1),
      fileSize: stats.size,
      filePath: filePath,
      uploadDate: stats.birthtime || stats.ctime,
      error: "Không thể đọc metadata",
      // Thêm các URLs
      streamUrl: urls.streamUrl,
      directUrl: urls.directUrl,
      downloadUrl: urls.downloadUrl,
      // Không có ảnh bìa
      coverUrl: null,
      coverFilename: null,
      year: null,
      genre: null,
      track: null,
      albumartist: null,
    };
  }
}

// API Routes

// 0. API để lấy thông tin storage
app.get("/api/storage/info", async (req, res) => {
  try {
    const stats = await fs.stat(UPLOAD_DIR);

    // Đếm số file trong thư mục
    const files = await fs.readdir(UPLOAD_DIR);
    const musicFiles = files.filter((file) => file.match(/\.(mp3|wav|flac|aac|ogg|webm|m4a)$/i));

    // Đếm số cover images
    let coverFiles = 0;
    try {
      const coversList = await fs.readdir(COVERS_DIR);
      coverFiles = coversList.filter((file) => file.match(/\.(jpg|jpeg|png|gif|webp)$/i)).length;
    } catch (err) {
      // Covers directory might not exist yet
    }

    // Tính tổng dung lượng
    let totalSize = 0;
    for (const file of files) {
      try {
        const filePath = path.join(UPLOAD_DIR, file);
        const fileStat = await fs.stat(filePath);
        if (fileStat.isFile()) {
          totalSize += fileStat.size;
        }
      } catch (err) {
        // Ignore errors for individual files
      }
    }

    // Kiểm tra xem có file music-list.json không
    let hasDatabase = false;
    let lastScan = null;
    try {
      await fs.access(MUSIC_LIST_FILE);
      hasDatabase = true;
      const dbContent = await fs.readFile(MUSIC_LIST_FILE, "utf8");
      const dbData = JSON.parse(dbContent);
      lastScan = dbData.lastScan;
    } catch (err) {
      // Database file doesn't exist
    }

    res.json({
      uploadDirectory: UPLOAD_DIR,
      coversDirectory: COVERS_DIR,
      musicListFile: MUSIC_LIST_FILE,
      totalFiles: files.length,
      musicFiles: musicFiles.length,
      coverFiles: coverFiles,
      totalSize: totalSize,
      totalSizeFormatted: formatBytes(totalSize),
      isExternal: !UPLOAD_DIR.includes(__dirname),
      writable: true, // Nếu đến được đây thì có thể ghi
      hasDatabase: hasDatabase,
      lastScan: lastScan,
      serverInfo: {
        port: PORT,
        nodeEnv: process.env.NODE_ENV || "development",
        version: require("./package.json").version,
      },
    });
  } catch (error) {
    console.error("Lỗi lấy thông tin storage:", error);
    res.status(500).json({
      error: "Không thể truy cập thư mục upload",
      uploadDirectory: UPLOAD_DIR,
      isExternal: !UPLOAD_DIR.includes(__dirname),
      writable: false,
      details: error.message,
    });
  }
});

// 1. API Upload file (hỗ trợ nhiều file)
app.post("/api/upload", upload.array("music", 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Không có file nào được upload" });
    }

    const uploadedFiles = [];
    const errors = [];

    console.log(`\n🎵 Processing ${req.files.length} uploaded files...`);

    // Xử lý từng file
    for (const file of req.files) {
      try {
        console.log(`📄 Processing: ${file.originalname}`);
        const metadata = await extractMetadata(file.path, req);
        uploadedFiles.push({
          originalName: file.originalname,
          filename: file.filename,
          size: file.size,
          path: file.path,
          metadata: metadata,
        });
        console.log(`✓ Processed: ${file.originalname}`);
      } catch (error) {
        console.error(`✗ Failed to process ${file.originalname}:`, error);
        errors.push({
          filename: file.originalname,
          error: error.message,
        });
      }
    }

    console.log(
      `✓ Upload completed: ${uploadedFiles.length}/${req.files.length} files successful\n`
    );

    res.json({
      message: `Upload thành công ${uploadedFiles.length}/${req.files.length} file!`,
      uploadedFiles: uploadedFiles,
      errors: errors,
      totalUploaded: uploadedFiles.length,
      totalErrors: errors.length,
    });
  } catch (error) {
    console.error("Lỗi upload:", error);
    res.status(500).json({ error: "Lỗi khi upload file", details: error.message });
  }
});

// 2. API scan folder và tạo file JSON
app.post("/api/scan", async (req, res) => {
  try {
    console.log("🔍 Starting folder scan:", UPLOAD_DIR);

    const files = await fs.readdir(UPLOAD_DIR);
    const musicFiles = files.filter((file) => file.match(/\.(mp3|wav|flac|aac|ogg|webm|m4a)$/i));

    console.log(`📁 Found ${musicFiles.length} music files`);

    const musicList = [];
    let processed = 0;

    for (const file of musicFiles) {
      const filePath = path.join(UPLOAD_DIR, file);
      try {
        console.log(`📄 Scanning ${++processed}/${musicFiles.length}: ${file}`);
        const metadata = await extractMetadata(filePath, req);
        musicList.push({
          id: Buffer.from(file).toString("base64"), // Tạo ID unique
          ...metadata,
        });
      } catch (error) {
        console.error(`✗ Error processing file ${file}:`, error);
      }
    }

    // Sắp xếp theo tên file
    musicList.sort((a, b) => a.filename.localeCompare(b.filename));

    // Lưu vào file JSON
    const dbData = {
      lastScan: new Date().toISOString(),
      totalFiles: musicList.length,
      scanInfo: {
        uploadDirectory: UPLOAD_DIR,
        totalFilesInDirectory: files.length,
        musicFilesFound: musicFiles.length,
        successfullyProcessed: musicList.length,
        errors: musicFiles.length - musicList.length,
      },
      files: musicList,
    };

    await fs.writeFile(MUSIC_LIST_FILE, JSON.stringify(dbData, null, 2));

    console.log("✓ Scan completed, database saved");

    res.json({
      message: "Scan thành công!",
      totalFiles: musicList.length,
      lastScan: new Date().toISOString(),
      scanInfo: dbData.scanInfo,
      files: musicList,
    });
  } catch (error) {
    console.error("Lỗi scan:", error);
    res.status(500).json({ error: "Lỗi khi scan thư mục", details: error.message });
  }
});

// 3. API lấy danh sách nhạc từ file JSON
app.get("/api/music", async (req, res) => {
  try {
    // Kiểm tra xem file JSON có tồn tại không
    if (!fsSync.existsSync(MUSIC_LIST_FILE)) {
      return res.json({
        message: "Chưa có dữ liệu. Vui lòng scan thư mục trước.",
        lastScan: null,
        totalFiles: 0,
        files: [],
        needsScan: true,
      });
    }

    const data = await fs.readFile(MUSIC_LIST_FILE, "utf8");
    const musicData = JSON.parse(data);

    // Update URLs với current request
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    if (musicData.files) {
      musicData.files = musicData.files.map((file) => {
        const urls = generateFileUrls(file.filename, baseUrl);
        const coverUrl = generateCoverUrl(file.coverFilename, baseUrl);
        return {
          ...file,
          streamUrl: urls.streamUrl,
          directUrl: urls.directUrl,
          downloadUrl: urls.downloadUrl,
          coverUrl: coverUrl,
        };
      });
    }

    // Thêm thông tin về storage
    musicData.needsScan = false;
    musicData.storageInfo = {
      uploadDirectory: UPLOAD_DIR,
      isExternal: !UPLOAD_DIR.includes(__dirname),
    };

    res.json(musicData);
  } catch (error) {
    console.error("Lỗi đọc danh sách nhạc:", error);
    res.status(500).json({ error: "Lỗi khi đọc danh sách nhạc", details: error.message });
  }
});

// 4. API xóa file nhạc
app.delete("/api/music/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const filename = Buffer.from(id, "base64").toString();
    const filePath = path.join(UPLOAD_DIR, filename);

    console.log(`🗑️  Deleting file: ${filename}`);

    // Kiểm tra file có tồn tại không
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ error: "File không tồn tại" });
    }

    // Xóa album art nếu có
    try {
      const hash = crypto.createHash("md5").update(filename).digest("hex");
      const possibleExtensions = [".jpg", ".png", ".gif", ".webp"];

      for (const ext of possibleExtensions) {
        const coverPath = path.join(COVERS_DIR, `${hash}${ext}`);
        if (fsSync.existsSync(coverPath)) {
          await fs.unlink(coverPath);
          console.log(`✓ Deleted album art: ${hash}${ext}`);
          break;
        }
      }
    } catch (coverError) {
      console.error("⚠️  Error deleting album art:", coverError);
      // Không throw error vì việc xóa album art không quan trọng bằng việc xóa file nhạc
    }

    // Xóa file nhạc
    await fs.unlink(filePath);
    console.log(`✓ Deleted music file: ${filename}`);

    res.json({
      message: "Xóa file thành công",
      deletedFile: filename,
    });
  } catch (error) {
    console.error("Lỗi xóa file:", error);
    res.status(500).json({ error: "Lỗi khi xóa file", details: error.message });
  }
});

// 5. API stream nhạc (giữ nguyên cho backward compatibility)
app.get("/api/stream/:id", (req, res) => {
  try {
    const { id } = req.params;
    const filename = Buffer.from(id, "base64").toString();
    const filePath = path.join(UPLOAD_DIR, filename);

    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ error: "File không tồn tại" });
    }

    const stat = fsSync.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fsSync.createReadStream(filePath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "audio/mpeg",
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": "audio/mpeg",
      };
      res.writeHead(200, head);
      fsSync.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error("Lỗi stream file:", error);
    res.status(500).json({ error: "Lỗi khi stream file", details: error.message });
  }
});

// 6. API download file (force download)
app.get("/api/download/:id", (req, res) => {
  try {
    const { id } = req.params;
    const filename = Buffer.from(id, "base64").toString();
    const filePath = path.join(UPLOAD_DIR, filename);

    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ error: "File không tồn tại" });
    }

    const stat = fsSync.statSync(filePath);

    // Set headers để force download
    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Content-Length": stat.size,
    });

    fsSync.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error("Lỗi download file:", error);
    res.status(500).json({ error: "Lỗi khi download file", details: error.message });
  }
});

// 7. API lấy thông tin một file cụ thể
app.get("/api/music/info/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const filename = Buffer.from(id, "base64").toString();
    const filePath = path.join(UPLOAD_DIR, filename);

    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ error: "File không tồn tại" });
    }

    const metadata = await extractMetadata(filePath, req);

    res.json({
      id: id,
      ...metadata,
    });
  } catch (error) {
    console.error("Lỗi lấy thông tin file:", error);
    res.status(500).json({ error: "Lỗi khi lấy thông tin file", details: error.message });
  }
});

// 8. API Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    storage: {
      uploadDir: UPLOAD_DIR,
      isExternal: !UPLOAD_DIR.includes(__dirname),
      accessible: fsSync.existsSync(UPLOAD_DIR),
    },
  });
});

// 9. API Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "Music Manager Backend",
    version: require("./package.json").version,
    description: "Backend API for Music Manager application",
    endpoints: {
      health: "/api/health",
      storage: "/api/storage/info",
      upload: "POST /api/upload",
      scan: "POST /api/scan",
      music: "/api/music",
      stream: "/api/stream/:id",
      download: "/api/download/:id",
      delete: "DELETE /api/music/:id",
      info: "/api/music/info/:id",
    },
    storage: {
      uploadDirectory: UPLOAD_DIR,
      isExternal: !UPLOAD_DIR.includes(__dirname),
    },
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Error occurred:", error);

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "File quá lớn (tối đa 100MB)",
        code: "FILE_TOO_LARGE",
        maxSize: "100MB",
      });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        error: "Quá nhiều file (tối đa 20 file)",
        code: "TOO_MANY_FILES",
        maxCount: 20,
      });
    }
  }

  res.status(500).json({
    error: error.message,
    code: "INTERNAL_SERVER_ERROR",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.path,
    method: req.method,
    availableEndpoints: [
      "GET /",
      "GET /api/health",
      "GET /api/storage/info",
      "POST /api/upload",
      "POST /api/scan",
      "GET /api/music",
      "GET /api/stream/:id",
      "GET /api/download/:id",
      "DELETE /api/music/:id",
      "GET /api/music/info/:id",
    ],
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n🛑 SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\n🛑 SIGINT received, shutting down gracefully...");
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🎵 Music Manager Server Started!`);
  console.log(`=================================`);
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`📁 Upload Dir: ${UPLOAD_DIR}`);
  console.log(`🖼️  Covers Dir: ${COVERS_DIR}`);
  console.log(`📊 Storage API: http://localhost:${PORT}/api/storage/info`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📖 API Docs: http://localhost:${PORT}/`);
  console.log(`🎸 Ready to rock! 🎶\n`);
});

module.exports = app;
