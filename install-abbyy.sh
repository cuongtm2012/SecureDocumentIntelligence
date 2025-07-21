
#!/bin/bash

echo "🚀 ABBYY FineReader Engine Installation Script"
echo "=============================================="

# Configuration
ABBYY_INSTALL_DIR="/opt/ABBYY/FineReaderEngine12"
ABBYY_BIN_DIR="$ABBYY_INSTALL_DIR/Bin"
ABBYY_LICENSE_DIR="$ABBYY_INSTALL_DIR/License"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Check system requirements
check_requirements() {
    print_status "Checking system requirements..."
    
    # Check OS
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        print_error "This script is designed for Linux systems"
        exit 1
    fi
    
    # Check CPU architecture
    if [[ $(uname -m) != "x86_64" ]]; then
        print_error "x86_64 architecture required"
        exit 1
    fi
    
    # Check available space (2GB minimum)
    available_space=$(df / | tail -1 | awk '{print $4}')
    required_space=2097152  # 2GB in KB
    
    if [[ $available_space -lt $required_space ]]; then
        print_error "Insufficient disk space. 2GB required."
        exit 1
    fi
    
    print_status "System requirements check passed"
}

# Install system dependencies
install_dependencies() {
    print_status "Installing system dependencies..."
    
    apt update -qq
    apt install -y \
        build-essential \
        libxml2-dev \
        libxslt1-dev \
        zlib1g-dev \
        libc6-dev \
        libgcc-s1 \
        libstdc++6 \
        wget \
        curl
    
    print_status "Dependencies installed successfully"
}

# Create installation directory
create_directories() {
    print_status "Creating installation directories..."
    
    mkdir -p "$ABBYY_INSTALL_DIR"
    mkdir -p "$ABBYY_BIN_DIR"
    mkdir -p "$ABBYY_LICENSE_DIR"
    mkdir -p "/tmp/abbyy_ocr"
    
    print_status "Directories created"
}

# Download ABBYY FineReader Engine (if URL provided)
download_abbyy() {
    if [[ -n "$ABBYY_DOWNLOAD_URL" ]]; then
        print_status "Downloading ABBYY FineReader Engine..."
        
        cd /tmp
        wget -O "FREngine12_Linux.tar.gz" "$ABBYY_DOWNLOAD_URL"
        
        if [[ $? -eq 0 ]]; then
            print_status "Download completed"
            
            # Extract the archive
            tar -xzf "FREngine12_Linux.tar.gz"
            
            # Copy to installation directory
            cp -r FREngine12_Linux_x64/* "$ABBYY_INSTALL_DIR/"
            
            print_status "Files extracted to $ABBYY_INSTALL_DIR"
        else
            print_error "Download failed. Please download manually."
            return 1
        fi
    else
        print_warning "No download URL provided. Please manually copy ABBYY files to $ABBYY_INSTALL_DIR"
    fi
}

# Set up permissions
setup_permissions() {
    print_status "Setting up permissions..."
    
    # Make executables runnable
    find "$ABBYY_BIN_DIR" -type f -name "FREngine*" -exec chmod +x {} \;
    
    # Set directory permissions
    chmod -R 755 "$ABBYY_INSTALL_DIR"
    chmod 755 "/tmp/abbyy_ocr"
    
    print_status "Permissions configured"
}

# Install license file
install_license() {
    if [[ -f "license.xml" ]]; then
        print_status "Installing license file..."
        
        cp "license.xml" "$ABBYY_LICENSE_DIR/"
        chmod 644 "$ABBYY_LICENSE_DIR/license.xml"
        
        print_status "License file installed"
    else
        print_warning "License file 'license.xml' not found in current directory"
        print_warning "Please copy your license file to $ABBYY_LICENSE_DIR/license.xml"
    fi
}

# Create symbolic links
create_symlinks() {
    print_status "Creating symbolic links..."
    
    ln -sf "$ABBYY_BIN_DIR/FREngine12" "/usr/local/bin/abbyy-frengine"
    
    print_status "Symbolic links created"
}

# Verify installation
verify_installation() {
    print_status "Verifying installation..."
    
    if [[ -f "$ABBYY_BIN_DIR/FREngine12" ]]; then
        print_status "ABBYY FineReader Engine executable found"
        
        # Test execution
        if "$ABBYY_BIN_DIR/FREngine12" --version >/dev/null 2>&1; then
            print_status "ABBYY engine test successful"
        else
            print_warning "ABBYY engine test failed - may need license file"
        fi
    else
        print_error "ABBYY executable not found"
        return 1
    fi
    
    if [[ -f "$ABBYY_LICENSE_DIR/license.xml" ]]; then
        print_status "License file found"
    else
        print_warning "License file not found - please install manually"
    fi
}

# Create environment file
create_env_config() {
    print_status "Creating environment configuration..."
    
    cat > "/etc/environment.d/abbyy.conf" << EOF
# ABBYY FineReader Engine Configuration
ABBYY_ENGINE_PATH=$ABBYY_BIN_DIR
ABBYY_LICENSE_FILE=$ABBYY_LICENSE_DIR/license.xml
ABBYY_LANGUAGES=Vietnamese,English
ABBYY_RECOGNITION_QUALITY=thorough
ABBYY_PREPROCESSING_LEVEL=medium
ABBYY_IMAGE_RESOLUTION=300
EOF
    
    # Also create for current session
    export ABBYY_ENGINE_PATH="$ABBYY_BIN_DIR"
    export ABBYY_LICENSE_FILE="$ABBYY_LICENSE_DIR/license.xml"
    
    print_status "Environment configuration created"
}

# Print installation summary
print_summary() {
    echo ""
    echo "🎉 ABBYY FineReader Engine Installation Summary"
    echo "=============================================="
    echo "Installation Directory: $ABBYY_INSTALL_DIR"
    echo "Executable Path: $ABBYY_BIN_DIR/FREngine12"
    echo "License Directory: $ABBYY_LICENSE_DIR"
    echo ""
    echo "Environment Variables:"
    echo "ABBYY_ENGINE_PATH=$ABBYY_BIN_DIR"
    echo "ABBYY_LICENSE_FILE=$ABBYY_LICENSE_DIR/license.xml"
    echo ""
    
    if [[ -f "$ABBYY_LICENSE_DIR/license.xml" ]]; then
        print_status "Installation completed successfully!"
        echo ""
        echo "Next steps:"
        echo "1. Restart your Node.js application"
        echo "2. Test the OCR endpoint: curl http://localhost:5000/api/ocr/abbyy/health"
        echo "3. Upload a test document for processing"
    else
        print_warning "Installation completed but license file is missing!"
        echo ""
        echo "Required steps:"
        echo "1. Copy your ABBYY license file to: $ABBYY_LICENSE_DIR/license.xml"
        echo "2. Run: sudo chmod 644 $ABBYY_LICENSE_DIR/license.xml"
        echo "3. Restart your Node.js application"
        echo "4. Test the OCR endpoint: curl http://localhost:5000/api/ocr/abbyy/health"
    fi
}

# Main installation process
main() {
    echo "Starting ABBYY FineReader Engine installation..."
    echo ""
    
    check_root
    check_requirements
    install_dependencies
    create_directories
    
    # Download if URL is provided as environment variable
    if [[ -n "$ABBYY_DOWNLOAD_URL" ]]; then
        download_abbyy
    fi
    
    setup_permissions
    install_license
    create_symlinks
    create_env_config
    verify_installation
    print_summary
}

# Handle command line arguments
case "${1:-}" in
    "help"|"--help"|"-h")
        echo "ABBYY FineReader Engine Installation Script"
        echo ""
        echo "Usage:"
        echo "  sudo ./install-abbyy.sh                    # Install with manual file copy"
        echo "  sudo ABBYY_DOWNLOAD_URL=<url> ./install-abbyy.sh  # Install with download"
        echo ""
        echo "Environment variables:"
        echo "  ABBYY_DOWNLOAD_URL  # URL to download ABBYY archive (optional)"
        echo ""
        echo "Prerequisites:"
        echo "  - Ubuntu/Debian Linux x86_64"
        echo "  - 2GB free disk space"
        echo "  - Valid ABBYY license file (license.xml)"
        echo "  - ABBYY FineReader Engine installation files"
        exit 0
        ;;
    *)
        main
        ;;
esac
