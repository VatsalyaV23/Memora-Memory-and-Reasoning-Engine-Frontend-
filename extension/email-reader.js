/**
 * Email Reader Integration
 * Captures decisions and insights from Gmail
 */

class EmailReader {
  constructor() {
    this.emails = [];
    this.isAuthorized = false;
  }

  /**
   * Request Gmail permission
   */
  async requestPermission() {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          console.error('Auth error:', chrome.runtime.lastError);
          resolve(false);
          return;
        }
        this.isAuthorized = true;
        resolve(true);
      });
    });
  }

  /**
   * Get recent emails
   */
  async getRecentEmails(count = 5) {
    if (!this.isAuthorized) {
      const authorized = await this.requestPermission();
      if (!authorized) return [];
    }

    try {
      const token = await this.getAuthToken();
      const response = await fetch(
        'https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=' + count,
        {
          headers: { Authorization: 'Bearer ' + token }
        }
      );

      if (!response.ok) throw new Error('Gmail API error');

      const data = await response.json();
      const messages = data.messages || [];

      // Fetch full message details
      const emailPromises = messages.map(msg => this.getMessageDetails(msg.id, token));
      this.emails = await Promise.all(emailPromises);

      return this.emails;
    } catch (error) {
      console.error('Error fetching emails:', error);
      return this.getMockEmails();
    }
  }

  /**
   * Get full message details
   */
  async getMessageDetails(messageId, token) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
        {
          headers: { Authorization: 'Bearer ' + token }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch message');

      const message = await response.json();
      const headers = message.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const body = this.extractBody(message.payload);

      return {
        id: messageId,
        subject: subject,
        from: from,
        body: body,
        timestamp: message.internalDate
      };
    } catch (error) {
      console.error('Error getting message details:', error);
      return null;
    }
  }

  /**
   * Extract email body
   */
  extractBody(payload) {
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain') {
          const data = part.body.data;
          return data ? atob(data.replace(/-/g, '+').replace(/_/g, '/')) : '';
        }
      }
    }
    const data = payload.body.data;
    return data ? atob(data.replace(/-/g, '+').replace(/_/g, '/')) : '';
  }

  /**
   * Extract decisions from email body
   */
  extractDecisions(emailBody) {
    const decisionKeywords = [
      'decided',
      'agreed',
      'approved',
      'will use',
      'will adopt',
      'will implement',
      'chose',
      'selected'
    ];

    const sentences = emailBody.split(/[.!?]+/);
    const decisions = sentences
      .filter(s => decisionKeywords.some(kw => s.toLowerCase().includes(kw)))
      .map(s => s.trim())
      .filter(s => s.length > 10);

    return decisions;
  }

  /**
   * Get mock emails (for demo)
   */
  getMockEmails() {
    return [
      {
        id: 'mock_1',
        subject: 'Architecture Decision: Microservices vs Monolith',
        from: 'engineering@company.com',
        body: 'After reviewing the options, we decided to go with a microservices architecture for better scalability and independence of services.',
        timestamp: Date.now()
      },
      {
        id: 'mock_2',
        subject: 'Database Selection Meeting Notes',
        from: 'tech-lead@company.com',
        body: 'We agreed to use PostgreSQL for its ACID compliance and complex query support. This will be the primary database for our new system.',
        timestamp: Date.now() - 86400000
      }
    ];
  }

  /**
   * Get auth token
   */
  getAuthToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });
  }
}

// Export for use in popup
const emailReader = new EmailReader();