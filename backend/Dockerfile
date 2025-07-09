# Sử dụng Node.js 18 LTS image
FROM node:18-alpine

# Tạo thư mục làm việc trong container
WORKDIR /app

# Copy package.json và package-lock.json (nếu có)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy toàn bộ source code
COPY . .

# Tạo thư mục uploads và covers với quyền phù hợp
RUN mkdir -p uploads/covers && \
    chown -R node:node uploads && \
    chmod -R 755 uploads

# Chuyển sang user node để tăng bảo mật
USER node

# Expose port 3001
EXPOSE 3001

# Health check để kiểm tra container có hoạt động không
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/music', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Chạy ứng dụng
CMD ["npm", "start"]