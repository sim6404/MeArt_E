# MeArt - AI 기반 감정 아트 생성기

AI 기반 감정 분석과 명화 스타일 합성을 통한 개인화된 아트 생성 웹 애플리케이션

## 🚀 Railway 배포

### Railway MCP Server 설정 (Cursor 통합)

Railway 배포를 Cursor에서 직접 관리할 수 있도록 MCP Server를 설정했습니다.

#### 1. Railway CLI 설치
```bash
npm install -g @railway/cli
```

#### 2. Railway 로그인
```bash
railway login
```

#### 3. MCP Server 설정 확인
`.cursor/mcp.json` 파일이 이미 설정되어 있습니다:
```json
{
  "mcpServers": {
    "railway-mcp-server": {
      "command": "npx",
      "args": ["-y", "@railway/mcp-server"],
      "env": {}
    }
  }
}
```

#### 4. Cursor에서 Railway 도구 사용
- Cursor를 재시작하면 Railway MCP Server가 도구 목록에 나타납니다
- Railway 서비스 목록 조회, 배포, 환경변수 관리 등을 직접 수행할 수 있습니다

#### 5. 토큰 기반 인증 (선택사항)
CLI 로그인 대신 토큰을 사용하려면 `.cursor/mcp.json`에서 주석을 해제하고 토큰을 설정하세요:
```json
{
  "mcpServers": {
    "railway-mcp-server": {
      "command": "npx",
      "args": ["-y", "@railway/mcp-server"],
      "env": {
        "RAILWAY_API_TOKEN": "<your-token>",
        "RAILWAY_PROJECT_ID": "<project-id>"
      }
    }
  }
}
```

### 배포 상태 확인
```bash
# 로컬 테스트
npm run railway-selftest

# Railway CLI로 배포 상태 확인
railway status
```

## 🎨 About

MeArt is an AI-powered emotion art generator that creates personalized artwork based on user emotions. The application features brush effects and background removal capabilities.

## 🚀 Features

- **Emotion Analysis**: AI-powered emotion detection from images
- **Background Removal**: Automatic background removal using AI
- **Brush Effects**: Artistic brush stroke effects
- **Static Asset Management**: Robust BG_image serving with tolerant resolver
- **Multi-Platform Deployment**: Support for Render, Vercel, and Railway

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, JavaScript
- **AI Integration**: Emotion analysis and background removal APIs
- **Deployment**: Render, Vercel, Railway

## 📁 Project Structure

```
MeArt/
├── public/
│   ├── BG_image/           # Background images with tolerant resolver
│   │   ├── .keep          # Git tracking file
│   │   ├── _index.json    # Asset manifest
│   │   └── *.jpg          # Background images
│   ├── assets.js          # Client-side asset helpers
│   └── index.html         # Main application
├── scripts/
│   ├── assets-selftest.mjs    # Asset availability test
│   ├── local-test.mjs         # Local functionality test
│   ├── test-analyze.mjs       # Analyze emotion API test
│   └── selftest.mjs           # General API test
├── server.js              # Main Express server
├── package.json           # Dependencies and scripts
├── render.yaml            # Render deployment config
├── vercel.json            # Vercel deployment config
└── railway.json           # Railway deployment config
```

## 🚀 Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/sim6404/MeArt_E.git
   cd MeArt_E
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Run tests**
   ```bash
   npm run test-local      # Full local test
   npm run test-assets     # Asset availability test
   npm run test-analyze    # Emotion analysis test
   ```

### Deployment

#### Render (Recommended)
- Auto-deploys on push to main branch
- Manual deploy available in Render Dashboard
- Health check: `/healthz`

#### Vercel
```bash
npm i -g vercel
vercel --prod
```

#### Railway
```bash
npm i -g @railway/cli
railway login
railway up
```

## 🔧 Configuration

### Environment Variables

- `PORT`: Server port (default: 10000)
- `NODE_ENV`: Environment (production/development)
- `AI_PROVIDER`: AI service provider (openai/replicate/none)
- `OPENAI_API_KEY`: OpenAI API key
- `REPLICATE_API_TOKEN`: Replicate API token

### API Endpoints

- `GET /healthz`: Health check
- `GET /readyz`: Readiness check
- `GET /api/status`: Server status
- `POST /api/analyze-emotion`: Emotion analysis
- `POST /api/remove-bg`: Background removal
- `GET /BG_image/*`: Static background images

## 🧪 Testing

### Local Testing
```bash
npm run test-local      # Complete local test suite
npm run test-assets     # Asset availability test
npm run test-analyze    # Emotion analysis API test
npm run selftest        # General API functionality test
```

### Asset Testing
The application includes comprehensive asset testing to ensure all BG_image files are accessible:

```bash
npm run test-assets
```

This tests:
- `/BG_image/the_harbor_at_lorient_1970.17.48.jpg`
- `/BG_image/farmhouse_in_provence_1970.17.34.jpg`
- `/BG_image/seascape_at_port-en-bessin_normandy_1972.9.21.jpg`
- `/BG_image/hampton_court_green_1970.17.53.jpg`

## 🔍 Troubleshooting

### Common Issues

1. **404 Errors on BG_image**
   - Ensure files exist in `/public/BG_image/`
   - Check `.gitignore` doesn't exclude the directory
   - Verify Git LFS is properly configured

2. **Deployment Issues**
   - Check Render Dashboard for manual deploy
   - Verify build logs for errors
   - Ensure all dependencies are in `package.json`

3. **API Errors**
   - Check environment variables are set
   - Verify API keys are valid
   - Check server logs for detailed error messages

### Debug Commands

```bash
npm run routes          # List all server routes
npm run lock:sync       # Sync package-lock.json
npm run create-placeholders  # Create missing asset placeholders
```

## 📊 Performance

- **Static Assets**: 30-day cache with immutable headers
- **API Responses**: JSON-only error responses
- **Image Processing**: Optimized file size limits (25MB)
- **Caching**: In-memory cache for asset resolution

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm run test-local`
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- **Live Demo**: [MeArt on Render](https://meart-e.onrender.com)
- **Repository**: [GitHub](https://github.com/sim6404/MeArt_E)
- **Issues**: [GitHub Issues](https://github.com/sim6404/MeArt_E/issues)

---

**Last Updated**: 2024-12-19
**Version**: 1.0.55 