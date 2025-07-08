import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  Upload,
  Button,
  Table,
  message,
  Card,
  Space,
  Typography,
  Popconfirm,
  Tag,
  Progress,
  Tooltip,
  Divider,
  Row,
  Col,
  Statistic,
} from "antd";
import {
  InboxOutlined,
  ScanOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  SoundOutlined,
  CloudUploadOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;
const { Dragger } = Upload;

const API_BASE = "http://localhost:3001/api";

// Cấu hình axios
const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000, // 30 seconds timeout
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor để xử lý lỗi
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("API Error:", error);
    if (error.code === "ECONNREFUSED") {
      message.error("Không thể kết nối tới server backend");
    } else if (error.response?.status >= 500) {
      message.error("Lỗi server nội bộ");
    }
    return Promise.reject(error);
  }
);

function MusicManager() {
  const [musicList, setMusicList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastScan, setLastScan] = useState(null);
  const [totalFiles, setTotalFiles] = useState(0);
  const [currentPlaying, setCurrentPlaying] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  // Fetch danh sách nhạc từ API
  const fetchMusicList = async () => {
    setLoading(true);
    try {
      const response = await api.get("/music");
      const data = response.data;

      if (data.files) {
        setMusicList(data.files);
        setLastScan(data.lastScan);
        setTotalFiles(data.totalFiles);
      } else {
        setMusicList([]);
        setLastScan(null);
        setTotalFiles(0);
      }
    } catch (error) {
      console.error("Lỗi fetch music list:", error);
      message.error("Không thể tải danh sách nhạc");
    } finally {
      setLoading(false);
    }
  };

  // Scan thư mục
  const handleScan = async () => {
    setScanning(true);
    try {
      const response = await api.post("/scan");
      const data = response.data;

      message.success(data.message);
      await fetchMusicList(); // Refresh danh sách
    } catch (error) {
      console.error("Lỗi scan:", error);
      message.error(error.response?.data?.error || "Không thể scan thư mục");
    } finally {
      setScanning(false);
    }
  };

  // Upload nhiều file
  const handleUpload = async (fileList) => {
    if (!Array.isArray(fileList)) {
      fileList = [fileList];
    }

    setUploading(true);
    setUploadQueue(fileList);
    setUploadProgress(0);

    const formData = new FormData();
    fileList.forEach((file) => {
      formData.append("music", file);
    });

    try {
      const response = await api.post("/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        },
      });

      const data = response.data;

      // Destructure với default values để tránh undefined
      const { uploadedFiles = [], errors = [], totalUploaded = 0, totalErrors = 0 } = data || {};

      if (totalUploaded > 0 && totalErrors === 0) {
        message.success(`Upload thành công ${totalUploaded} file!`);
      } else if (totalUploaded > 0 && totalErrors > 0) {
        message.warning(
          `Upload thành công ${totalUploaded}/${
            totalUploaded + totalErrors
          } file. ${totalErrors} file bị lỗi.`
        );
      } else {
        message.error("Tất cả file upload đều bị lỗi!");
      }

      // Hiển thị chi tiết lỗi nếu có (safe check)
      if (errors && errors.length > 0) {
        console.error("Chi tiết lỗi upload:", errors);
        errors.forEach((error) => {
          console.warn(`File ${error.filename}: ${error.error}`);
        });
      }

      return false;
    } catch (error) {
      console.error("Lỗi upload:", error);

      // Xử lý lỗi chi tiết hơn
      if (error.response) {
        // Server trả về error response
        const errorMessage = error.response.data?.error || `Lỗi server: ${error.response.status}`;
        message.error(errorMessage);
      } else if (error.request) {
        // Request được gửi nhưng không có response
        message.error("Không thể kết nối tới server");
      } else {
        // Lỗi khác
        message.error("Lỗi khi upload file");
      }

      return false;
    } finally {
      setUploading(false);
      setUploadQueue([]);
      setUploadProgress(0);
    }
  };

  // Xóa file
  const handleDelete = async (id) => {
    try {
      await api.delete(`/music/${id}`);

      message.success("Xóa file thành công");

      // Nếu đang phát file này thì dừng
      if (currentPlaying?.id === id) {
        setCurrentPlaying(null);
        setIsPlaying(false);
        if (audioRef.current) {
          audioRef.current.pause();
        }
      }

      // Refresh danh sách
      await fetchMusicList();
    } catch (error) {
      console.error("Lỗi xóa file:", error);
      message.error(error.response?.data?.error || "Không thể xóa file");
    }
  };

  // Phát nhạc
  const handlePlay = (record) => {
    if (currentPlaying?.id === record.id) {
      // Toggle play/pause cho cùng bài
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    } else {
      // Phát bài mới
      setCurrentPlaying(record);
      setIsPlaying(true);
      if (audioRef.current) {
        audioRef.current.src = `http://localhost:3001/api/stream/${record.id}`;
        audioRef.current.play();
      }
    }
  };

  // Audio event handlers
  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  // Format thời gian
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Format kích thước file
  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  useEffect(() => {
    fetchMusicList();
  }, []);

  const columns = [
    {
      title: "Phát",
      key: "play",
      width: 60,
      render: (_, record) => (
        <Button
          type="text"
          icon={
            currentPlaying?.id === record.id && isPlaying ? (
              <PauseCircleOutlined />
            ) : (
              <PlayCircleOutlined />
            )
          }
          onClick={() => handlePlay(record)}
          className="text-blue-500 hover:text-blue-700"
        />
      ),
    },
    {
      title: "Tên bài hát",
      dataIndex: "title",
      key: "title",
      ellipsis: true,
      render: (text, record) => (
        <div>
          <div className="font-medium text-gray-900">{text}</div>
          <div className="text-sm text-gray-500">{record.filename}</div>
        </div>
      ),
    },
    {
      title: "Nghệ sĩ",
      dataIndex: "artist",
      key: "artist",
      ellipsis: true,
    },
    {
      title: "Album",
      dataIndex: "album",
      key: "album",
      ellipsis: true,
    },
    {
      title: "Thời lượng",
      dataIndex: "duration",
      key: "duration",
      width: 100,
      render: (duration) => formatTime(duration),
    },
    {
      title: "Định dạng",
      dataIndex: "format",
      key: "format",
      width: 80,
      render: (format) => <Tag color="blue">{format?.toUpperCase()}</Tag>,
    },
    {
      title: "Kích thước",
      dataIndex: "fileSize",
      key: "fileSize",
      width: 100,
      render: (size) => formatFileSize(size),
    },
    {
      title: "Hành động",
      key: "actions",
      width: 100,
      render: (_, record) => (
        <Popconfirm
          title="Bạn có chắc muốn xóa file này?"
          onConfirm={() => handleDelete(record.id)}
          okText="Có"
          cancelText="Không"
        >
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ];

  const uploadProps = {
    name: "music",
    multiple: true,
    accept: ".mp3,.wav,.flac,.aac,.ogg,.webm,.m4a",
    customRequest: ({ file, fileList, onSuccess, onError }) => {
      // Handle fileList safely - có thể là undefined hoặc không phải array
      let allFiles = [];

      if (fileList && Array.isArray(fileList)) {
        // Nếu có fileList, collect tất cả files
        allFiles = fileList.map((f) => f.originFileObj || f).filter(Boolean);
      } else if (file) {
        // Nếu chỉ có single file
        allFiles = [file];
      }

      if (allFiles.length === 0) {
        onError(new Error("Không có file nào để upload"));
        return;
      }

      handleUpload(allFiles)
        .then(() => {
          onSuccess();
          // Tự động refresh danh sách sau khi upload xong
          setTimeout(() => {
            fetchMusicList();
          }, 500);
        })
        .catch((error) => {
          onError(error);
        });
    },
    showUploadList: {
      showPreviewIcon: false,
      showRemoveIcon: true,
      showDownloadIcon: false,
    },
    beforeUpload: (file, fileList) => {
      // Kiểm tra định dạng file
      const isValidFormat = file.name.match(/\.(mp3|wav|flac|aac|ogg|webm|m4a)$/i);
      if (!isValidFormat) {
        message.error(`${file.name} không phải là file nhạc hợp lệ!`);
        return false;
      }

      // Kiểm tra kích thước file (100MB)
      const isValidSize = file.size / 1024 / 1024 < 100;
      if (!isValidSize) {
        message.error(`${file.name} quá lớn! Tối đa 100MB.`);
        return false;
      }

      return true;
    },
    onChange: (info) => {
      // Cập nhật trạng thái upload
      if (info.file.status === "uploading") {
        setUploading(true);
      } else if (info.file.status === "done") {
        setUploading(false);
      } else if (info.file.status === "error") {
        setUploading(false);
      }
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Title level={2} className="text-center text-gray-800 mb-2">
            <SoundOutlined className="mr-3" />
            Quản lý Nhạc
          </Title>
          <Text type="secondary" className="block text-center">
            Upload và quản lý file nhạc của bạn
          </Text>
        </div>

        {/* Stats */}
        <Row gutter={16} className="mb-6">
          <Col span={8}>
            <Card>
              <Statistic title="Tổng số bài hát" value={totalFiles} prefix={<SoundOutlined />} />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="Lần scan cuối"
                value={lastScan ? new Date(lastScan).toLocaleString("vi-VN") : "Chưa scan"}
                valueStyle={{ fontSize: "16px" }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="Đang phát"
                value={currentPlaying?.title || "Không có"}
                valueStyle={{ fontSize: "16px" }}
              />
            </Card>
          </Col>
        </Row>

        {/* Upload Section */}
        <Card
          className="mb-6"
          title={
            <>
              <CloudUploadOutlined className="mr-2" />
              Upload File Nhạc
            </>
          }
        >
          <Dragger {...uploadProps} className="mb-4">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Kéo thả nhiều file vào đây hoặc click để chọn file</p>
            <p className="ant-upload-hint">
              Hỗ trợ upload nhiều file cùng lúc. Các định dạng: MP3, WAV, FLAC, AAC, OGG, WebM, M4A
              (tối đa 100MB/file)
            </p>
          </Dragger>

          {/* Upload Progress */}
          {uploading && uploadQueue.length > 0 && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <Text strong>Đang upload {uploadQueue.length} file...</Text>
                <Text type="secondary">{uploadProgress}%</Text>
              </div>
              <Progress percent={uploadProgress} status="active" strokeColor="#1890ff" />
              <div className="mt-2 text-sm text-gray-600">
                {uploadQueue.map((file, index) => (
                  <div key={index} className="truncate">
                    📁 {file.name || file.filename}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Controls */}
        <Card className="mb-6">
          <Space size="large" wrap>
            <Button
              type="primary"
              icon={<ScanOutlined />}
              onClick={handleScan}
              loading={scanning}
              size="large"
            >
              {scanning ? "Đang scan..." : "Scan thư mục"}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchMusicList}
              loading={loading}
              size="large"
            >
              Tải lại danh sách
            </Button>
            <Tooltip title="Scan và tải lại danh sách sau khi upload">
              <Button
                type="dashed"
                icon={<ScanOutlined />}
                onClick={async () => {
                  await handleScan();
                  setTimeout(() => fetchMusicList(), 500);
                }}
                loading={scanning || loading}
                size="large"
              >
                Scan & Refresh
              </Button>
            </Tooltip>
          </Space>
        </Card>

        {/* Music Player */}
        {currentPlaying && (
          <Card className="mb-6" title="Đang phát">
            <div className="flex items-center space-x-4">
              <Button
                type="text"
                size="large"
                icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={() => handlePlay(currentPlaying)}
                className="text-2xl"
              />
              <div className="flex-1">
                <div className="font-medium">{currentPlaying.title}</div>
                <div className="text-sm text-gray-500">{currentPlaying.artist}</div>
                <Progress
                  percent={duration ? (progress / duration) * 100 : 0}
                  showInfo={false}
                  strokeColor="#1890ff"
                  className="mt-2"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{formatTime(progress)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Music List */}
        <Card
          title={
            <>
              <SoundOutlined className="mr-2" />
              Danh sách nhạc ({totalFiles} bài)
            </>
          }
        >
          <Table
            columns={columns}
            dataSource={musicList}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 15,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} trong ${total} bài hát`,
              pageSizeOptions: ["10", "15", "25", "50"],
            }}
            scroll={{ x: 800 }}
            locale={{
              emptyText: (
                <div className="text-center py-8">
                  <SoundOutlined className="text-4xl text-gray-300 mb-4" />
                  <div className="text-gray-500">Chưa có file nhạc nào.</div>
                  <div className="text-sm text-gray-400 mt-2">
                    Hãy upload file hoặc scan thư mục để bắt đầu!
                  </div>
                </div>
              ),
            }}
            size="middle"
          />
        </Card>

        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          onTimeUpdate={handleAudioTimeUpdate}
          onLoadedMetadata={handleAudioLoadedMetadata}
          onEnded={handleAudioEnded}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        />
      </div>
    </div>
  );
}

export default MusicManager;
