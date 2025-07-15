# User Agent Scraper

A web-based user agent scraper that fetches user agents from the APILayer User Agent API with real-time updates and device filtering capabilities.

## Features

- **Real-time Updates**: Server-Sent Events (SSE) for live user agent streaming
- **Device Filtering**: Select from 10 device types (Android, Chrome, Desktop, Firefox, IE, Linux, Mac, Mobile, Tablet, Windows)
- **Progress Tracking**: Live progress bar and statistics
- **Copy to Clipboard**: One-click copying of all scraped user agents
- **Responsive Design**: Works on desktop and mobile devices
- **Error Handling**: Graceful error handling and retry logic
- **API Key Input**: Secure API key input for APILayer service

## Installation

1. Clone or download the project
2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to `http://localhost:3000`

## Usage

1. **Enter API Key**: Get your API key from [APILayer](https://apilayer.com) and enter it in the API Key field
2. **Set Maximum Count**: Choose how many user agents to scrape (1-1000)
3. **Select Device Filters**: Choose which device types to include in the scraping
4. **Start Scraping**: Click the "Start Scraping" button to begin
5. **View Results**: User agents will appear in real-time in the results area
6. **Copy Results**: Use the copy button to copy all scraped user agents to clipboard

## API Response Format

The API returns detailed user agent information in JSON format:

```json
{
  "browser": {
    "name": "Chrome",
    "version": "49.0.2650",
    "version_major": 49
  },
  "device": {
    "brand": null,
    "model": null,
    "name": "Other"
  },
  "os": {
    "name": "Ubuntu",
    "version": null,
    "version_major": null
  },
  "type": {
    "bot": false,
    "mobile": false,
    "pc": true,
    "tablet": false,
    "touch_capable": false
  },
  "ua": "Mozilla/5.0 (X11; Ubuntu; Linux i686 on x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2650.46 Safari/537.36"
}
```

## Device Filter Options

The following device types can be selected:

- **android**: Android user agents
- **chrome**: Chrome browser user agents
- **desktop**: Desktop device user agents
- **firefox**: Firefox browser user agents
- **ie**: Internet Explorer user agents
- **linux**: Linux OS user agents
- **mac**: Mac OS user agents
- **mobile**: Mobile device user agents
- **tablet**: Tablet device user agents
- **windows**: Windows OS user agents

## Technical Details

### Frontend
- **HTML/CSS**: Responsive design with gradient backgrounds
- **JavaScript**: ES6 classes for clean code organization
- **Server-Sent Events**: Real-time updates without WebSocket complexity

### Backend
- **Node.js**: Runtime environment
- **Express.js**: Web framework
- **EJS**: Templating engine
- **Axios**: HTTP client for API requests

### API Integration
- **APILayer User Agent API**: External service for user agent generation
- **Rate Limiting**: 200ms delay between requests to prevent API abuse
- **Error Handling**: Graceful handling of API failures

## File Structure

```
userAgentApi/
├── server.js              # Main server file
├── package.json           # Project dependencies
├── views/
│   └── index.ejs         # Main HTML template
├── public/
│   ├── css/
│   │   └── style.css     # Styling
│   └── js/
│       └── script.js     # Frontend JavaScript
└── README.md             # This file
```

## Development

To run in development mode:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Dependencies

- **express**: Web framework
- **ejs**: Templating engine
- **axios**: HTTP client

## License

This project is open source and available under the MIT License.

## Contributing

Feel free to submit issues and enhancement requests!