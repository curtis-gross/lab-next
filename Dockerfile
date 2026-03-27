FROM node:20-alpine as builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN rm -f package-lock.json && npm install

# Copy source code and build the frontend
COPY . .
RUN npm run build

# Remove development dependencies to keep the image small
# (Optional, depending on if you need them for the server)
# RUN npm prune --production

EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
