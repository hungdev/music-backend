import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
const VibesMusicPlayer = () => {
  const [showLibrary, setShowLibrary] = useState(false);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(240); // 4 minutes default
  const [isDragging, setIsDragging] = useState(false);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const progressRef = useRef(null);
  const audioRef = useRef(null);

  // Fetch songs from API
  useEffect(() => {
    const fetchSongs = async () => {
      try {
        setLoading(true);

        // Use axios instead of fetch
        const response = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/music`, {
          timeout: 10000, // 10 second timeout
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = response.data;

        // Map API response to our song format
        const mappedSongs = data.files.map((file, index) => ({
          id: file.id,
          title: file.title,
          artist: file.artist,
          album: file.album,
          image: getEmojiForSong(file.title, index), // Generate emoji based on title/index
          url: file.streamUrl, // Use streamUrl for playing
          cover: file.coverUrl,
          duration: Math.floor(file.duration), // Convert to integer seconds
          year: file.year,
          genre: file.genre,
          track: file.track,
        }));

        setSongs(mappedSongs);
        setError(null);
        console.log("Songs loaded successfully:", mappedSongs);
      } catch (err) {
        console.error("Error fetching songs:", err);

        // Better error handling for different axios error types
        let errorMessage = "Không thể kết nối tới server";

        if (err.code === "ECONNABORTED") {
          errorMessage = "Timeout - Server phản hồi chậm";
        } else if (err.response) {
          // Server responded with error status
          errorMessage = `Server error: ${err.response.status} - ${err.response.statusText}`;
        } else if (err.request) {
          // Request was made but no response
          errorMessage = "Không có phản hồi từ server - Kiểm tra kết nối mạng";
        } else {
          errorMessage = err.message;
        }

        setError(errorMessage);
        setSongs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSongs();
  }, []);

  // Helper function to generate emoji for songs
  const getEmojiForSong = (title, index) => {
    const emojis = ["🎵", "🎶", "🎤", "🎧", "🎼", "🎹", "🎸", "🥁", "🎺", "🎷"];
    return emojis[index % emojis.length];
  };

  // Custom Icons
  const PlayIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-gray-700">
      <path d="M8 5v14l11-7z" />
    </svg>
  );

  const PauseIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-gray-700">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );

  const PrevIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-gray-700">
      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  );

  const NextIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-gray-700">
      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </svg>
  );

  const currentSong = songs[currentSongIndex] || null;

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;

    const handleLoadedMetadata = () => {
      setDuration(Math.floor(audio.duration));
    };

    const handleTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(Math.floor(audio.currentTime));
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      nextSong();
    };

    const handleCanPlay = () => {
      if (isPlaying) {
        audio.play().catch(console.error);
      }
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("canplay", handleCanPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("canplay", handleCanPlay);
    };
  }, [currentSongIndex, isPlaying, isDragging, currentSong]);

  // Load new song when index changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && currentSong?.url) {
      audio.src = currentSong.url;
      audio.load();
      setCurrentTime(0);
      if (currentSong.duration) {
        setDuration(currentSong.duration);
      }
    }
  }, [currentSongIndex, currentSong]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleProgressClick = (e) => {
    if (!progressRef.current || !currentSong) return;

    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = Math.floor(percentage * duration);

    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = Math.max(0, Math.min(newTime, duration));
      setCurrentTime(Math.max(0, Math.min(newTime, duration)));
    }
  };

  const handleProgressDrag = (e) => {
    if (!isDragging || !progressRef.current || !currentSong) return;

    const rect = progressRef.current.getBoundingClientRect();
    const dragX = e.clientX - rect.left;
    const percentage = dragX / rect.width;
    const newTime = Math.floor(percentage * duration);

    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = Math.max(0, Math.min(newTime, duration));
      setCurrentTime(Math.max(0, Math.min(newTime, duration)));
    }
  };

  const handleMouseDown = (e) => {
    if (!currentSong) return;
    setIsDragging(true);
    handleProgressClick(e);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleProgressDrag);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleProgressDrag);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const nextSong = () => {
    if (songs.length === 0) return;
    setCurrentSongIndex((prev) => (prev + 1) % songs.length);
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const prevSong = () => {
    if (songs.length === 0) return;
    setCurrentSongIndex((prev) => (prev - 1 + songs.length) % songs.length);
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("Error playing audio:", error);
      setIsPlaying(false);
    }
  };

  const selectSong = (index) => {
    if (songs.length === 0) return;
    setCurrentSongIndex(index);
    setCurrentTime(0);
    setIsPlaying(true);
    setShowLibrary(false);
  };

  const progressPercentage = (currentTime / duration) * 100;

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Hidden Audio Element */}
      <audio ref={audioRef} preload="metadata" crossOrigin="anonymous" />

      {/* Header */}
      <header className="bg-white shadow-sm p-4 flex justify-between items-center relative z-10">
        <h1 className="text-2xl font-bold text-gray-800">Vibes</h1>
        <button
          onClick={() => setShowLibrary(!showLibrary)}
          className="px-4 py-2 border-2 border-gray-800 text-gray-800 font-medium hover:bg-gray-800 hover:text-white transition-colors duration-200"
        >
          Library ♫
        </button>
      </header>

      {/* Main Container - Fixed Height with Bottom Padding for Controls */}
      <div className="flex-1 flex relative" style={{ paddingBottom: "160px" }}>
        {/* Sidebar Library */}
        <div
          className={`fixed top-0 left-0 h-full bg-white shadow-lg transform transition-transform duration-300 ease-in-out z-20 ${
            showLibrary ? "translate-x-0" : "-translate-x-full"
          } w-80`}
        >
          {/* Sidebar Header */}
          <div className="p-4 border-b bg-white">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-800">Library</h2>
              <button
                onClick={() => setShowLibrary(false)}
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                ×
              </button>
            </div>
          </div>
          <div className="overflow-y-auto h-full pt-0 pb-32">
            {loading ? (
              <div className="p-4 text-center text-gray-600">
                <div className="text-lg mb-2">🎵</div>
                <div>Đang tải...</div>
              </div>
            ) : error ? (
              <div className="p-4 text-center text-gray-600">
                <div className="text-lg mb-2">⚠️</div>
                <div className="text-sm">Lỗi: {error}</div>
              </div>
            ) : songs.length === 0 ? (
              <div className="p-4 text-center text-gray-600">
                <div className="text-lg mb-2">🎼</div>
                <div>Không có bài hát</div>
              </div>
            ) : (
              songs.map((song, index) => (
                <div
                  key={song.id}
                  onClick={() => selectSong(index)}
                  className={`flex items-center p-4 hover:bg-gray-100 cursor-pointer transition-colors ${
                    index === currentSongIndex ? "bg-purple-100 border-r-4 border-purple-500" : ""
                  }`}
                >
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-3 overflow-hidden">
                    <img
                      src={song.cover}
                      alt={`${song.title} cover`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = "none";
                        e.target.nextSibling.style.display = "flex";
                      }}
                    />
                    <div className="w-full h-full bg-gray-200 items-center justify-center text-lg hidden">
                      {song.image}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-800">{song.title}</h3>
                    <p className="text-sm text-gray-600">
                      {song.artist}
                      {song.album && ` • ${song.album}`}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500">
                    {Math.floor(song.duration / 60)}:{String(song.duration % 60).padStart(2, "0")}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Invisible Overlay - Click outside to close sidebar */}
        {showLibrary && (
          <div className="fixed inset-0 z-10" onClick={() => setShowLibrary(false)} />
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-auto">
          {loading ? (
            <div className="text-center">
              <div className="text-2xl mb-4">🎵</div>
              <div className="text-xl text-gray-600">Đang tải nhạc...</div>
            </div>
          ) : error ? (
            <div className="text-center">
              <div className="text-2xl mb-4">⚠️</div>
              <div className="text-xl text-gray-600 mb-2">Lỗi kết nối API</div>
              <div className="text-sm text-gray-500">{error}</div>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
              >
                Thử lại
              </button>
            </div>
          ) : songs.length === 0 ? (
            <div className="text-center">
              <div className="text-2xl mb-4">🎼</div>
              <div className="text-xl text-gray-600">Không có bài hát nào</div>
            </div>
          ) : currentSong ? (
            <>
              {/* Back arrow indicator */}
              <div className="absolute top-8 left-1/2 transform -translate-x-1/2">
                <div className="text-gray-600 text-sm">← {currentSong.title}</div>
              </div>

              {/* Album Cover & Song Info */}
              <div className="text-center max-w-md mx-auto">
                {/* Album Cover */}
                <div className="mb-8 flex justify-center">
                  <div className="relative w-80 h-80">
                    <img
                      src={currentSong.cover}
                      alt={`${currentSong.title} cover`}
                      className="w-full h-full object-cover rounded-2xl shadow-2xl"
                      onLoad={() => console.log("Image loaded successfully")}
                      onError={(e) => {
                        console.log("Image failed to load, showing fallback");
                        e.target.style.display = "none";
                        const fallback = e.target.parentNode.querySelector(".fallback-cover");
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                    {/* Fallback div */}
                    <div
                      className="fallback-cover absolute inset-0 w-full h-full bg-gradient-to-br from-purple-400 to-pink-400 rounded-2xl shadow-2xl flex items-center justify-center text-6xl text-white"
                      style={{ display: "none" }}
                    >
                      {currentSong.image}
                    </div>
                  </div>
                </div>

                {/* Song Info */}
                <h2 className="text-4xl font-bold text-gray-800 mb-4">{currentSong.title}</h2>
                <p className="text-xl text-gray-600 mb-2">{currentSong.artist}</p>
                {currentSong.album && (
                  <p className="text-lg text-gray-500 mb-12">{currentSong.album}</p>
                )}
              </div>
            </>
          ) : null}
        </main>
      </div>

      {/* Player Controls - Fixed at Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-8 pb-6 z-30">
        {/* Progress Bar */}
        <div className="max-w-4xl mx-auto mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div
            ref={progressRef}
            className={`w-full h-2 bg-gray-200 rounded-full relative ${
              currentSong && !loading ? "cursor-pointer" : "cursor-not-allowed opacity-50"
            }`}
            onClick={currentSong && !loading ? handleProgressClick : undefined}
            onMouseDown={currentSong && !loading ? handleMouseDown : undefined}
          >
            <div
              className="h-full bg-gray-400 rounded-full relative transition-all duration-100"
              style={{ width: `${progressPercentage}%` }}
            >
              <div
                className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-gray-600 rounded-full cursor-grab active:cursor-grabbing"
                style={{ display: isDragging || progressPercentage > 5 ? "block" : "none" }}
              />
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex justify-center items-center space-x-8">
          <button
            onClick={prevSong}
            disabled={loading || songs.length === 0}
            className="p-3 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PrevIcon />
          </button>

          <button
            onClick={togglePlay}
            disabled={loading || songs.length === 0 || !currentSong}
            className="p-4 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <button
            onClick={nextSong}
            disabled={loading || songs.length === 0}
            className="p-3 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <NextIcon />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VibesMusicPlayer;
