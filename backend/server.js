const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const cors = require("cors");
const mm = require("music-metadata");
const { normalizeFilename } = require("./utils");

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Tạo thư mục uploads nếu chưa tồn tại
const UPLOAD_DIR = path.join(__dirname, "uploads");
const MUSIC_LIST_FILE = path.join(__dirname, "music-list.json");

if (!fsSync.existsSync(UPLOAD_DIR)) {
  fsSync.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Serve static files từ thư mục uploads
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    setHeaders: (res, path) => {
      // Set proper headers cho audio files
      res.set({
        "Content-Type": "audio/mpeg",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      });
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

// Hàm tạo URLs cho file
function generateFileUrls(filename, baseUrl = `http://localhost:${PORT}`) {
  const encodedId = Buffer.from(filename).toString("base64");
  return {
    streamUrl: `${baseUrl}/api/stream/${encodedId}`,
    directUrl: `${baseUrl}/uploads/${encodeURIComponent(filename)}`,
    downloadUrl: `${baseUrl}/api/download/${encodedId}`,
  };
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
    };
  }
}

// API Routes

// 1. API Upload file (hỗ trợ nhiều file)
app.post("/api/upload", upload.array("music", 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Không có file nào được upload" });
    }

    const uploadedFiles = [];
    const errors = [];

    // Xử lý từng file
    for (const file of req.files) {
      try {
        const metadata = await extractMetadata(file.path, req);
        uploadedFiles.push({
          originalName: file.originalname,
          filename: file.filename,
          size: file.size,
          path: file.path,
          metadata: metadata,
        });
      } catch (error) {
        console.error(`Lỗi xử lý file ${file.originalname}:`, error);
        errors.push({
          filename: file.originalname,
          error: error.message,
        });
      }
    }

    res.json({
      message: `Upload thành công ${uploadedFiles.length}/${req.files.length} file!`,
      uploadedFiles: uploadedFiles,
      errors: errors,
      totalUploaded: uploadedFiles.length,
      totalErrors: errors.length,
    });
  } catch (error) {
    console.error("Lỗi upload:", error);
    res.status(500).json({ error: "Lỗi khi upload file" });
  }
});

// 2. API scan folder và tạo file JSON
app.post("/api/scan", async (req, res) => {
  try {
    console.log("Bắt đầu scan thư mục:", UPLOAD_DIR);

    const files = await fs.readdir(UPLOAD_DIR);
    const musicFiles = files.filter((file) => file.match(/\.(mp3|wav|flac|aac|ogg|webm|m4a)$/i));

    console.log(`Tìm thấy ${musicFiles.length} file nhạc`);

    const musicList = [];

    for (const file of musicFiles) {
      const filePath = path.join(UPLOAD_DIR, file);
      try {
        const metadata = await extractMetadata(filePath, req);
        musicList.push({
          id: Buffer.from(file).toString("base64"), // Tạo ID unique
          ...metadata,
        });
      } catch (error) {
        console.error(`Lỗi xử lý file ${file}:`, error);
      }
    }

    // Sắp xếp theo tên file
    musicList.sort((a, b) => a.filename.localeCompare(b.filename));

    // Lưu vào file JSON
    await fs.writeFile(
      MUSIC_LIST_FILE,
      JSON.stringify(
        {
          lastScan: new Date().toISOString(),
          totalFiles: musicList.length,
          files: musicList,
        },
        null,
        2
      )
    );

    console.log("Scan hoàn tất, đã lưu vào file JSON");

    res.json({
      message: "Scan thành công!",
      totalFiles: musicList.length,
      lastScan: new Date().toISOString(),
      files: musicList,
    });
  } catch (error) {
    console.error("Lỗi scan:", error);
    res.status(500).json({ error: "Lỗi khi scan thư mục" });
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
      });
    }

    const data = await fs.readFile(MUSIC_LIST_FILE, "utf8");
    const musicData = JSON.parse(data);

    // Update URLs với current request
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    if (musicData.files) {
      musicData.files = musicData.files.map((file) => {
        const urls = generateFileUrls(file.filename, baseUrl);
        return {
          ...file,
          streamUrl: urls.streamUrl,
          directUrl: urls.directUrl,
          downloadUrl: urls.downloadUrl,
        };
      });
    }

    res.json(musicData);
  } catch (error) {
    console.error("Lỗi đọc danh sách nhạc:", error);
    res.status(500).json({ error: "Lỗi khi đọc danh sách nhạc" });
  }
});

// 4. API xóa file nhạc
app.delete("/api/music/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const filename = Buffer.from(id, "base64").toString();
    const filePath = path.join(UPLOAD_DIR, filename);

    // Kiểm tra file có tồn tại không
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ error: "File không tồn tại" });
    }

    // Xóa file
    await fs.unlink(filePath);

    res.json({ message: "Xóa file thành công" });
  } catch (error) {
    console.error("Lỗi xóa file:", error);
    res.status(500).json({ error: "Lỗi khi xóa file" });
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
    res.status(500).json({ error: "Lỗi khi stream file" });
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
    res.status(500).json({ error: "Lỗi khi download file" });
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
    res.status(500).json({ error: "Lỗi khi lấy thông tin file" });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File quá lớn (tối đa 100MB)" });
    }
  }
  res.status(500).json({ error: error.message });
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
  console.log(`Thư mục upload: ${UPLOAD_DIR}`);
  console.log(`Static files served at: http://localhost:${PORT}/uploads/`);
});

module.exports = app;
