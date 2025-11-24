FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_API_URL=http://localhost:8000
ARG VITE_OPENAI_API_KEY
ARG VITE_OPENAI_API_BASE_URL

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_OPENAI_API_KEY=${VITE_OPENAI_API_KEY}
ENV VITE_OPENAI_API_BASE_URL=${VITE_OPENAI_API_BASE_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


# --- Production Image ---
FROM node:20-alpine AS prod

WORKDIR /app

# Static file server installieren
RUN npm install -g serve

# dist aus dem Build-Container kopieren
COPY --from=build /app/dist ./dist

EXPOSE 3000

# Statisches Hosting
CMD ["serve", "-s", "dist", "-l", "3000"]
