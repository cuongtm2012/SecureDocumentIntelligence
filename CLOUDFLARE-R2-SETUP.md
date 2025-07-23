# Cloudflare R2 Object Storage Setup Guide

This guide explains how to set up Cloudflare R2 Object Storage for secure file upload and storage in your OCR application.

## 1. Create Cloudflare R2 Bucket

### Step 1: Access Cloudflare Dashboard
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Log in to your Cloudflare account
3. Navigate to **R2 Object Storage** in the sidebar

### Step 2: Create a Bucket
1. Click **"Create bucket"**
2. Choose a unique bucket name (e.g., `ocr-documents-prod`)
3. Select your preferred region (or leave as default)
4. Click **"Create bucket"**

### Step 3: Configure Bucket Settings (Optional)
- **Public Access**: Keep private for secure document storage
- **CORS Policy**: Will be configured via API if needed
- **Lifecycle Rules**: Set up automatic deletion for old files if desired

## 2. Generate Cloudflare R2 API Tokens

### Method 1: R2 Token (Recommended)
1. In Cloudflare Dashboard, go to **R2 Object Storage**
2. Click **"Manage R2 API tokens"**
3. Click **"Create API token"**
4. Configure the token:
   - **Token name**: `OCR-App-R2-Access`
   - **Permissions**: 
     - `Object:Read` (for downloading files)
     - `Object:Write` (for uploading files)
     - `Object:Delete` (for file deletion)
   - **Account resources**: Include → Your account
   - **Zone resources**: Include → All zones from account (or specific if needed)
   - **Bucket resources**: Include → Specific bucket → Select your bucket
5. Click **"Continue to summary"**
6. Review and click **"Create token"**
7. **IMPORTANT**: Copy the token immediately and store it securely

### Method 2: Account API Token (Alternative)
1. Go to **My Profile** → **API Tokens**
2. Click **"Create Token"**
3. Use **"Custom token"** template
4. Configure permissions:
   - **Account**: `Cloudflare R2:Edit`
   - **Zone Resources**: Include All zones
5. Click **"Continue to summary"** → **"Create Token"**

## 3. Get Required Credentials

You need these four pieces of information:

### Account ID
1. In Cloudflare Dashboard, go to the right sidebar
2. Copy your **Account ID**

### Access Key ID and Secret Access Key
1. In **R2 Object Storage**, click **"Manage R2 API tokens"**
2. Click **"Create API token"** or use existing token
3. You'll get:
   - **Access Key ID** (starts with something like `f1234...`)
   - **Secret Access Key** (long random string)

### Bucket Name
- The name you chose when creating the bucket

## 4. Environment Variables Configuration

Add these environment variables to your `.env` file:

```env
# Cloudflare R2 Configuration
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_R2_ACCESS_KEY_ID=your_access_key_id_here
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret_access_key_here
CLOUDFLARE_R2_BUCKET_NAME=your_bucket_name_here

# Optional: Custom R2 endpoint (if using custom domain)
# CLOUDFLARE_R2_ENDPOINT=https://your-custom-domain.com
```

## 5. Test Configuration

The application will automatically test the R2 connection on startup. You should see:

```
✅ Cloudflare R2 Storage initialized for bucket: your-bucket-name
🔍 Testing R2 connection...
✅ R2 connection test successful
```

## 6. Security Best Practices

### Token Security
- Never commit API tokens to version control
- Use environment variables only
- Rotate tokens regularly (every 90 days)
- Use minimum required permissions

### Bucket Security
- Keep buckets private by default
- Use CORS policies to restrict access origins
- Monitor access logs regularly
- Set up CloudTrail logging for audit trails

### Application Security
- Validate file types and sizes before upload
- Scan uploaded files for malware
- Use presigned URLs for direct uploads when possible
- Implement rate limiting for uploads

## 7. Cost Optimization

### Storage Classes
- Use **Standard** for frequently accessed files
- Consider **Infrequent Access** for archived documents

### Lifecycle Policies
```json
{
  "rules": [
    {
      "id": "delete-old-temp-files",
      "status": "Enabled",
      "filter": {
        "prefix": "temp/"
      },
      "expiration": {
        "days": 7
      }
    }
  ]
}
```

### Data Transfer
- Enable R2 to CloudFlare CDN integration to reduce egress costs
- Use compression for large files
- Implement caching strategies

## 8. Monitoring and Logging

### CloudFlare Analytics
- Monitor storage usage in R2 dashboard
- Track bandwidth and request metrics
- Set up billing alerts

### Application Logging
The application logs all R2 operations:
- Upload successes/failures
- Download requests
- File deletions
- Connection tests

## 9. Troubleshooting

### Common Issues

**"Access Denied" Error**
- Check API token permissions
- Verify bucket name is correct
- Ensure account ID matches

**"Bucket Not Found" Error**
- Verify bucket name in environment variables
- Check bucket exists in correct account

**"Invalid Credentials" Error**
- Verify Access Key ID and Secret Access Key
- Check if token has expired
- Ensure no extra spaces in environment variables

### Debug Mode
Enable debug logging by setting:
```env
DEBUG=r2-storage
```

## 10. Migration from Local Storage

When migrating from local file storage:

1. **Backup existing files**
2. **Test R2 integration** with new uploads first
3. **Migrate existing files** using the provided migration script
4. **Update database** to reference R2 keys instead of local paths
5. **Cleanup local files** after successful migration

The application supports both storage methods during transition.