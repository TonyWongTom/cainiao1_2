FROM node:20-alpine AS build
# Add libc6-compat for some native modules if needed
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
# Use --legacy-peer-deps to bypass react-datepicker dependency conflicts
RUN npm install --legacy-peer-deps
COPY . .

# Build-time environment variables
ARG VITE_APP_PASSWORD
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
