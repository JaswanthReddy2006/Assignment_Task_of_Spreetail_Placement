# Use the official Node.js 18-alpine image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source code
COPY . .

# Expose the API port
EXPOSE 5000

# Start the application using server.js
CMD ["node", "server.js"]
