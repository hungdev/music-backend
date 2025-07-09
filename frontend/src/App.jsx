import React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./screens/Home";
import MusicManagement from "./screens/MusicManagement";

export default function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/manage" element={<MusicManagement />} />
      </Routes>
    </div>
  );
}
