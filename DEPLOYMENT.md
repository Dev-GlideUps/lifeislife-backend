# Deployment Guide - LifeIsLive

Complete deployment guide for the LifeIsLive backend and admin panel.

## Domains

| Application | Domain | Port |
|-------------|--------|------|
| Backend API | api.lifeisliveapp.com | 5000 |
| Admin Panel | admin.lifeisliveapp.com | 3000 |

---

## Server Requirements (Staging)

| Resource | Specification |
|----------|---------------|
| CPU | 2 vCPUs |
| RAM | 4 GB |
| Storage | 80 GB SSD |
| OS | Ubuntu 22.04 LTS |
| Cost | ~$24/month |

---

## Quick Start

### Step 1: Create Droplet

1. Go to [Digital Ocean](https://cloud.digitalocean.com/)
2. Create Droplet:
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic, 2 vCPUs, 4 GB RAM, 80 GB SSD
   - **Region:** Choose closest to your users
   - **Authentication:** SSH Key (recommended)

### Step 2: Point Domains

Add A records in your DNS settings:

```
api.lifeisliveapp.com    -> Your Droplet IP
admin.lifeisliveapp.com  -> Your Droplet IP
```

### Step 3: Run Deployment Script

```bash
# SSH into droplet
ssh root@YOUR_DROPLET_IP

# Create and run deployment script
nano deploy.sh
# Paste the deploy.sh content, save and exit

chmod +x deploy.sh
./deploy.sh
```

### Step 4: Upload Your Files

From your local machine:

```bash
# Upload Backend API
scp -r ./backend/* root@YOUR_DROPLET_IP:/var/www/lifeislive/

# Upload Admin Panel
scp -r ./admin/* root@YOUR_DROPLET_IP:/var/www/lifeislive-admin/
```

Or use FileZilla/SFTP:
- Host: YOUR_DROPLET_IP
- User: root
- Backend path: /var/www/lifeislive
- Admin path: /var/www/lifeislive-admin

### Step 5: Configure & Start Applications

```bash
# SSH into server
ssh root@YOUR_DROPLET_IP

# ===== Backend API =====
cd /var/www/lifeislive
cp .env.example .env
nano .env              # Edit with your credentials
npm install --production
node seed.js           # Seed database if needed

# ===== Admin Panel (Next.js) =====
cd /var/www/lifeislive-admin
cp .env.example .env.local
nano .env.local        # Edit settings
npm install
npm run build

# ===== Start Both Apps =====
pm2 start /root/ecosystem.config.js
pm2 save
```

---

## Configuration Files

### Backend .env

Location: `/var/www/lifeislive/.env`

```env
# Server
PORT=5000
NODE_ENV=production
baseURL=https://api.lifeisliveapp.com/

# Database
mongoURI=mongodb://127.0.0.1:27017/lifeislive

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# JWT (Change this!)
JWT_SECRET=your-super-secret-key

# Agora
AGORA_APP_ID=your-app-id
AGORA_APP_CERTIFICATE=your-certificate

# Tencent
TENCENT_SDK_APP_ID=your-sdk-id
TENCENT_SECRET_KEY=your-secret-key

# API Secret Key
secretKey=your-api-secret
```

### Admin .env.local

Location: `/var/www/lifeislive-admin/.env.local`

```env
NEXT_PUBLIC_API_URL=https://api.lifeisliveapp.com
NEXT_PUBLIC_SOCKET_URL=https://api.lifeisliveapp.com
NODE_ENV=production
```

---

## File Upload Methods

### Method 1: SCP (Command Line)

```bash
# Single file
scp file.js root@YOUR_IP:/var/www/lifeislive/

# Directory
scp -r ./folder root@YOUR_IP:/var/www/lifeislive/

# Entire backend
scp -r ./* root@YOUR_IP:/var/www/lifeislive/
```

### Method 2: SFTP (FileZilla)

1. Open FileZilla
2. Connect:
   - Host: sftp://YOUR_IP
   - Username: root
   - Password: your-password (or use SSH key)
   - Port: 22
3. Navigate to `/var/www/lifeislive` or `/var/www/lifeislive-admin`
4. Drag and drop files

### Method 3: rsync (Faster for updates)

```bash
# Sync backend (only changed files)
rsync -avz --exclude 'node_modules' --exclude '.env' \
  ./backend/ root@YOUR_IP:/var/www/lifeislive/

# Sync admin
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude '.env.local' \
  ./admin/ root@YOUR_IP:/var/www/lifeislive-admin/
```

---

## Common Commands

### PM2 (Process Manager)

```bash
# Status
pm2 status

# Logs
pm2 logs                    # All logs
pm2 logs lifeislive         # API logs
pm2 logs lifeislive-admin   # Admin logs

# Restart
pm2 restart lifeislive      # Restart API
pm2 restart lifeislive-admin # Restart Admin
pm2 restart all             # Restart all

# Stop/Start
pm2 stop lifeislive
pm2 start lifeislive

# Monitor
pm2 monit
```

### Docker (MongoDB & Redis)

```bash
# Status
docker ps

# Logs
docker logs mongodb
docker logs redis

# Restart
docker restart mongodb
docker restart redis

# Stop all
cd /opt/docker && docker compose down

# Start all
cd /opt/docker && docker compose up -d
```

### Nginx

```bash
# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx

# Restart
sudo systemctl restart nginx

# Logs
tail -f /var/log/nginx/lifeislive_error.log
tail -f /var/log/nginx/lifeislive-admin_error.log
```

### SSL Certificates

```bash
# Check status
sudo certbot certificates

# Renew (auto-renews, but manual if needed)
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run
```

---

## Updating Applications

### After Uploading New Files

```bash
# Quick update script
./update.sh

# Or manually:

# Backend
cd /var/www/lifeislive
npm install --production
pm2 restart lifeislive

# Admin
cd /var/www/lifeislive-admin
npm install
npm run build
pm2 restart lifeislive-admin
```

---

## Troubleshooting

### App Not Starting

```bash
# Check PM2 logs
pm2 logs lifeislive --lines 100

# Check if port is in use
sudo lsof -i :5000
sudo lsof -i :3000
```

### MongoDB Connection Error

```bash
# Check if running
docker ps | grep mongodb

# Check logs
docker logs mongodb --tail 50

# Test connection
docker exec -it mongodb mongosh
```

### 502 Bad Gateway

```bash
# Check if app is running
pm2 status

# Check Nginx error log
tail -f /var/log/nginx/lifeislive_error.log

# Check if port is listening
netstat -tlnp | grep 5000
```

### SSL Not Working

```bash
# Re-run certbot
sudo certbot --nginx -d api.lifeisliveapp.com
sudo certbot --nginx -d admin.lifeisliveapp.com

# Check Nginx config
sudo nginx -t
```

---

## Backup

### MongoDB Backup

```bash
# Create backup
docker exec mongodb mongodump --out /data/backup

# Copy to host
docker cp mongodb:/data/backup ./mongo-backup-$(date +%Y%m%d)

# Compress
tar -czvf mongo-backup-$(date +%Y%m%d).tar.gz ./mongo-backup-*
```

### Restore MongoDB

```bash
# Copy backup to container
docker cp ./mongo-backup mongodb:/data/backup

# Restore
docker exec mongodb mongorestore /data/backup
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Digital Ocean Droplet                         │
│                      (Ubuntu 22.04 LTS)                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │                    Nginx (Reverse Proxy)                 │    │
│   │              :80 (HTTP) → :443 (HTTPS)                   │    │
│   └─────────────────────────────────────────────────────────┘    │
│              │                              │                     │
│              │                              │                     │
│   ┌──────────▼──────────┐      ┌───────────▼───────────┐         │
│   │ api.lifeisliveapp.com│      │admin.lifeisliveapp.com│         │
│   │                      │      │                       │         │
│   │   Node.js Backend    │      │   Next.js Admin       │         │
│   │   (PM2 Cluster)      │      │   (PM2)               │         │
│   │      :5000           │      │      :3000            │         │
│   └──────────────────────┘      └───────────────────────┘         │
│              │                                                    │
│              │                                                    │
│   ┌──────────▼──────────┐      ┌───────────────────────┐         │
│   │      MongoDB         │      │        Redis          │         │
│   │     (Docker)         │      │      (Docker)         │         │
│   │      :27017          │      │       :6379           │         │
│   └──────────────────────┘      └───────────────────────┘         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Support

For issues, check:
1. PM2 logs: `pm2 logs`
2. Nginx logs: `/var/log/nginx/`
3. Docker logs: `docker logs mongodb` / `docker logs redis`
