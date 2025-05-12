import notificationSystem from './notification-system.js';

/**
 * Initialize the notification UI components
 */
export function initNotificationUI() {
  // Create notification container if it doesn't exist
  let notificationContainer = document.getElementById('notification-container');
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md';
    document.body.appendChild(notificationContainer);
  }
  
  // Create notification bell and dropdown
  createNotificationBell();
  
  // Listen for notification changes
  notificationSystem.addListener(updateNotificationUI);
  
  // Initial update
  updateNotificationUI(notificationSystem.getNotifications());
}

/**
 * Create the notification bell and dropdown
 */
function createNotificationBell() {
  // Create bell container
  const bellContainer = document.createElement('div');
  bellContainer.id = 'notification-bell-container';
  bellContainer.className = 'relative';
  
  // Create bell button
  const bellButton = document.createElement('button');
  bellButton.id = 'notification-bell';
  bellButton.className = 'relative p-2 text-gray-700 hover:bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500';
  bellButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
    <span id="notification-badge" class="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full" style="display: none;">0</span>
  `;
  
  // Create dropdown
  const dropdown = document.createElement('div');
  dropdown.id = 'notification-dropdown';
  dropdown.className = 'absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg overflow-hidden z-50 border border-gray-200';
  dropdown.style.display = 'none';
  
  // Create dropdown header
  const dropdownHeader = document.createElement('div');
  dropdownHeader.className = 'px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center';
  dropdownHeader.innerHTML = `
    <h3 class="text-sm font-semibold text-gray-700">Notifications</h3>
    <div class="flex gap-2">
      <button id="mark-all-read" class="text-xs text-blue-600 hover:text-blue-800">Mark all as read</button>
      <button id="clear-all-notifications" class="text-xs text-red-600 hover:text-red-800">Clear all</button>
    </div>
  `;
  
  // Create notification list
  const notificationList = document.createElement('div');
  notificationList.id = 'notification-list';
  notificationList.className = 'max-h-96 overflow-y-auto';
  
  // Create empty state
  const emptyState = document.createElement('div');
  emptyState.id = 'notification-empty-state';
  emptyState.className = 'py-6 px-4 text-center text-gray-500';
  emptyState.innerHTML = 'No notifications';
  
  // Assemble dropdown
  dropdown.appendChild(dropdownHeader);
  dropdown.appendChild(notificationList);
  dropdown.appendChild(emptyState);
  
  // Assemble bell container
  bellContainer.appendChild(bellButton);
  bellContainer.appendChild(dropdown);
  
  // Add to navbar
  const navbar = document.querySelector('.navbar-brand');
  if (navbar && navbar.parentNode) {
    navbar.parentNode.insertBefore(bellContainer, navbar.nextSibling);
  } else {
    document.body.appendChild(bellContainer);
  }
  
  // Add event listeners
  bellButton.addEventListener('click', toggleNotificationDropdown);
  document.getElementById('mark-all-read').addEventListener('click', () => {
    notificationSystem.markAllAsRead();
    hideNotificationDropdown();
  });
  document.getElementById('clear-all-notifications').addEventListener('click', () => {
    notificationSystem.clearAll();
    hideNotificationDropdown();
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (event) => {
    const isClickInside = bellContainer.contains(event.target);
    if (!isClickInside) {
      hideNotificationDropdown();
    }
  });
}

/**
 * Toggle notification dropdown visibility
 */
function toggleNotificationDropdown() {
  const dropdown = document.getElementById('notification-dropdown');
  if (dropdown.style.display === 'none') {
    dropdown.style.display = 'block';
  } else {
    dropdown.style.display = 'none';
  }
}

/**
 * Hide notification dropdown
 */
function hideNotificationDropdown() {
  const dropdown = document.getElementById('notification-dropdown');
  dropdown.style.display = 'none';
}

/**
 * Update notification UI based on current notifications
 * @param {Array} notifications - Array of notification objects
 */
function updateNotificationUI(notifications) {
  // Update badge
  const unreadCount = notificationSystem.getUnreadCount();
  const badge = document.getElementById('notification-badge');
  
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
  
  // Update notification list
  const notificationList = document.getElementById('notification-list');
  const emptyState = document.getElementById('notification-empty-state');
  
  if (notifications.length === 0) {
    notificationList.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';
  notificationList.innerHTML = '';
  
  notifications.forEach(notification => {
    const notificationItem = document.createElement('div');
    notificationItem.className = `p-4 border-b border-gray-200 ${notification.read ? 'bg-white' : 'bg-blue-50'}`;
    
    // Determine icon based on notification type
    let iconHtml = '';
    switch (notification.type) {
      case 'success':
        iconHtml = '<div class="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center"><svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></div>';
        break;
      case 'error':
        iconHtml = '<div class="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center"><svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></div>';
        break;
      case 'warning':
        iconHtml = '<div class="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center"><svg class="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></div>';
        break;
      default: // info
        iconHtml = '<div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>';
    }
    
    // Format timestamp
    const timestamp = new Date(notification.timestamp);
    const formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formattedDate = timestamp.toLocaleDateString();
    
    notificationItem.innerHTML = `
      <div class="flex items-start">
        ${iconHtml}
        <div class="ml-3 flex-1">
          <div class="flex justify-between items-baseline">
            <p class="text-sm font-medium text-gray-900">${notification.title}</p>
            <span class="text-xs text-gray-500">${formattedTime}</span>
          </div>
          <p class="mt-1 text-sm text-gray-700">${notification.message}</p>
          <p class="mt-1 text-xs text-gray-500">${formattedDate}</p>
        </div>
      </div>
    `;
    
    // Add click handler to mark as read
    notificationItem.addEventListener('click', () => {
      notificationSystem.markAsRead(notification.id);
    });
    
    notificationList.appendChild(notificationItem);
  });
}

/**
 * Show a toast notification
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {boolean} showBrowserNotification - Whether to show browser notification
 */
export function showToast(title, message, type = 'info', showBrowserNotification = false) {
  // Add to notification system
  const notification = notificationSystem.addNotification({
    title,
    message,
    type,
    showBrowserNotification
  });
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `flex items-center p-4 mb-4 rounded-lg shadow-md transition-all duration-500 transform translate-x-full opacity-0`;
  
  // Set background color based on type
  switch (type) {
    case 'success':
      toast.classList.add('bg-green-50', 'border-l-4', 'border-green-500', 'text-green-800');
      break;
    case 'error':
      toast.classList.add('bg-red-50', 'border-l-4', 'border-red-500', 'text-red-800');
      break;
    case 'warning':
      toast.classList.add('bg-yellow-50', 'border-l-4', 'border-yellow-500', 'text-yellow-800');
      break;
    default: // info
      toast.classList.add('bg-blue-50', 'border-l-4', 'border-blue-500', 'text-blue-800');
  }
  
  // Set icon based on type
  let iconHtml = '';
  switch (type) {
    case 'success':
      iconHtml = '<svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>';
      break;
    case 'error':
      iconHtml = '<svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>';
      break;
    case 'warning':
      iconHtml = '<svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>';
      break;
    default: // info
      iconHtml = '<svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>';
  }
  
  // Create toast content
  toast.innerHTML = `
    <div class="flex items-center">
      ${iconHtml}
      <div>
        <div class="font-medium">${title}</div>
        <div class="text-sm opacity-90">${message}</div>
      </div>
    </div>
    <button type="button" class="ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex h-8 w-8 hover:bg-gray-200 focus:outline-none">
      <span class="sr-only">Close</span>
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>
    </button>
  `;
  
  // Add to notification container
  const container = document.getElementById('notification-container');
  container.appendChild(toast);
  
  // Animate in
  setTimeout(() => {
    toast.classList.remove('translate-x-full', 'opacity-0');
  }, 10);
  
  // Add close button handler
  const closeButton = toast.querySelector('button');
  closeButton.addEventListener('click', () => {
    removeToast(toast);
  });
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    removeToast(toast);
  }, 5000);
  
  return notification;
}

/**
 * Remove a toast element with animation
 * @param {HTMLElement} toast - Toast element to remove
 */
function removeToast(toast) {
  toast.classList.add('opacity-0', 'translate-x-full');
  setTimeout(() => {
    toast.remove();
  }, 300);
}
