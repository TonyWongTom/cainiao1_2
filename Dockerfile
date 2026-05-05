FROM node:20-alpine AS build
# Add libc6-compat for some native modules if needed
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
# Use --legacy-peer-deps to bypass react-datepicker dependency conflicts
RUN npm install --legacy-peer-deps
COPY . .

# Build-time environment variables
# These need to be passed as --build-arg during docker build
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_APP_PASSWORD

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_APP_PASSWORD=$VITE_APP_PASSWORD

RUN npm run build

# Stage 2: Python Flask app
FROM python:3.11-slim
WORKDIR /app

# Copy built frontend assets
COPY --from=build /app/dist ./dist

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Flask app
COPY app.py ./

EXPOSE 8080
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "app:app"]
