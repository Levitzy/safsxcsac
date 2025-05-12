/**
 * Session-independent notification system for Discord Bot Admin Panel
 * Uses localStorage for persistence and browser notifications when available
 */

class NotificationSystem {
  constructor() {
    this.notifications = [];
    this.maxNotifications = 50;
    this.storageKey = 'admin_panel_notifications';
    this.listeners = [];
    
    // Load existing notifications from localStorage
    this.loadFromStorage();
    
    // Request notification permission if not already granted
    if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }
  
  /**
   * Load notifications from localStorage
   */
  loadFromStorage() {
    try {
      const storedNotifications = localStorage.getItem(this.storageKey);
      if (storedNotifications) {
        this.notifications = JSON.parse(storedNotifications);
        // Ensure we don't exceed max notifications
        if (this.notifications.length > this.maxNotifications) {
          this.notifications = this.notifications.slice(-this.maxNotifications);
        }
      }
    } catch (error) {
      console.error('Failed to load notifications from storage:', error);
      this.notifications = [];
    }
  }
  
  /**
   * Save notifications to localStorage
   */
  saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.notifications));
    } catch (error) {
      console.error('Failed to save notifications to storage:', error);
    }
  }
  
  /**
   * Add a new notification
   * @param {Object} notification - Notification object
   * @param {string} notification.title - Notification title
   * @param {string} notification.message - Notification message
   * @param {string} notification.type - Notification type (success, error, warning, info)
   * @param {boolean} notification.showBrowserNotification - Whether to show browser notification
   */
  addNotification(notification) {
    const newNotification = {
      id: Date.now() + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      read: false,
      ...notification
    };
    
    // Add to beginning of array
    this.notifications.unshift(newNotification);
    
    // Limit the number of stored notifications
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }
    
    // Save to storage
    this.saveToStorage();
    
    // Notify listeners
    this.notifyListeners();
    
    // Show browser notification if requested
    if (notification.showBrowserNotification && window.Notification && Notification.permission === 'granted') {
      const browserNotification = new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico' // Adjust path as needed
      });
      
      browserNotification.onclick = () => {
        window.focus();
        this.markAsRead(newNotification.id);
      };
    }
    
    return newNotification;
  }
  
  /**
   * Get all notifications
   * @returns {Array} Array of notification objects
   */
  getNotifications() {
    return [...this.notifications];
  }
  
  /**
   * Get unread notifications count
   * @returns {number} Number of unread notifications
   */
  getUnreadCount() {
    return this.notifications.filter(notification => !notification.read).length;
  }
  
  /**
   * Mark a notification as read
   * @param {string} id - Notification ID
   */
  markAsRead(id) {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.read = true;
      this.saveToStorage();
      this.notifyListeners();
    }
  }
  
  /**
   * Mark all notifications as read
   */
  markAllAsRead() {
    this.notifications.forEach(notification => {
      notification.read = true;
    });
    this.saveToStorage();
    this.notifyListeners();
  }
  
  /**
   * Clear all notifications
   */
  clearAll() {
    this.notifications = [];
    this.saveToStorage();
    this.notifyListeners();
  }
  
  /**
   * Add a listener for notification changes
   * @param {Function} listener - Callback function
   */
  addListener(listener) {
    if (typeof listener === 'function' && !this.listeners.includes(listener)) {
      this.listeners.push(listener);
    }
  }
  
  /**
   * Remove a listener
   * @param {Function} listener - Callback function to remove
   */
  removeListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }
  
  /**
   * Notify all listeners of changes
   */
  notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.getNotifications());
      } catch (error) {
        console.error('Error in notification listener:', error);
      }
    });
  }
}

// Create a singleton instance
const notificationSystem = new NotificationSystem();

// Export the singleton
export default notificationSystem;
