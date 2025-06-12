FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libmagic1 \
    libmagic-dev \
    ffmpeg \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Configure ImageMagick policy for security - remove the problematic policy line
RUN sed -i '/@\*/d' /etc/ImageMagick-6/policy.xml

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories for thumbnails
RUN mkdir -p /app/thumbnails/{small,medium,large}

# Create non-root user
RUN useradd -m -u 1000 thumbgen
RUN chown -R thumbgen:thumbgen /app
USER thumbgen

CMD ["python", "generator.py"]