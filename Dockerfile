FROM node:20-alpine

WORKDIR /app

# Build arguments for Vite environment variables
ARG VITE_API_URL=http://localhost:8000
ARG VITE_OPENAI_API_KEY
ARG VITE_OPENAI_API_BASE_URL

# Set environment variables for build
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_OPENAI_API_KEY=${VITE_OPENAI_API_KEY}
ENV VITE_OPENAI_API_BASE_URL=${VITE_OPENAI_API_BASE_URL}

# Copy package files (npm uses package-lock.json, nicht pnpm-lock)
COPY package.json package-lock.json ./

# Install dependencies (sauber & reproduzierbar)
RUN npm ci

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application (Vite)
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
