/**
 * Enhanced Admin Permission Dialog
 * Fully responsive implementation using Tailwind CSS and Material 3 design principles
 */

/**
 * Initialize the admin permission dialog
 * @param {Array} commands - Array of available commands
 * @param {Object} adminPermissions - Current admin permissions
 * @param {Function} onSave - Callback function when permissions are saved
 */
export function initAdminPermissionDialog(commands, adminPermissions, onSave) {
  // Create dialog if it doesn't exist
  let dialog = document.getElementById("admin-permission-dialog")
  if (!dialog) {
    dialog = createDialog()
    document.body.appendChild(dialog)
  }

  // Initialize dialog functionality
  setupDialogFunctionality(commands, adminPermissions, onSave)
}

/**
 * Create the dialog element
 * @returns {HTMLElement} The dialog element
 */
function createDialog() {
  const dialog = document.createElement("div")
  dialog.id = "admin-permission-dialog"
  dialog.className = "fixed inset-0 z-50 overflow-y-auto hidden"
  dialog.setAttribute("aria-labelledby", "admin-permission-dialog-title")
  dialog.setAttribute("role", "dialog")
  dialog.setAttribute("aria-modal", "true")

  dialog.innerHTML = `
    <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
      <!-- Background overlay -->
      <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" aria-hidden="true"></div>
      
      <!-- Center dialog vertically -->
      <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
      
      <!-- Dialog panel -->
      <div class="inline-block overflow-hidden text-left align-bottom transition-all transform bg-white rounded-lg shadow-xl sm:my-8 sm:align-middle sm:max-w-lg sm:w-full md:max-w-xl">
        <!-- Dialog header -->
        <div class="px-4 pt-5 pb-4 bg-gray-50 sm:p-6 sm:pb-4 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium leading-6 text-gray-900" id="admin-permission-dialog-title">
              Edit Admin Permissions
            </h3>
            <button type="button" id="close-dialog-btn" class="text-gray-400 hover:text-gray-500 focus:outline-none">
              <span class="sr-only">Close</span>
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p class="mt-2 text-sm text-gray-500">Admin ID: <span id="admin-id-display" class="font-mono font-medium"></span></p>
        </div>
        
        <!-- Dialog content -->
        <div class="px-4 pt-5 pb-4 bg-white sm:p-6 sm:pb-4">
          <!-- All permissions toggle -->
          <div class="mb-6">
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="grant-all-permissions" class="sr-only peer">
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              <span class="ml-3 text-sm font-medium text-gray-900">Grant All Permissions ("all")</span>
            </label>
          </div>
          
          <!-- Specific commands section -->
          <div id="specific-commands-section">
            <h4 class="mb-3 text-sm font-medium text-gray-700">Assign Specific Admin Commands:</h4>
            
            <!-- Search box -->
            <div class="relative mb-4">
              <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input type="search" id="command-search" class="block w-full p-2 pl-10 text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500" placeholder="Search commands...">
            </div>
            
            <!-- Command list -->
            <div id="command-list" class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-2 border border-gray-200 rounded-lg">
              <!-- Commands will be populated here -->
            </div>
            
            <!-- No commands message -->
            <div id="no-commands-message" class="hidden py-4 text-center text-gray-500">
              No commands match your search
            </div>
          </div>
        </div>
        
        <!-- Dialog footer -->
        <div class="px-4 py-3 bg-gray-50 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-200">
          <button type="button" id="save-permissions-btn" class="inline-flex justify-center w-full px-4 py-2 text-base font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">
            Save Changes
          </button>
          <button type="button" id="cancel-btn" class="inline-flex justify-center w-full px-4 py-2 mt-3 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  `

  return dialog
}

/**
 * Setup dialog functionality
 * @param {Array} commands - Array of available commands
 * @param {Object} adminPermissions - Current admin permissions
 * @param {Function} onSave - Callback function when permissions are saved
 */
function setupDialogFunctionality(commands, adminPermissions, onSave) {
  const dialog = document.getElementById("admin-permission-dialog")
  const closeBtn = document.getElementById("close-dialog-btn")
  const cancelBtn = document.getElementById("cancel-btn")
  const saveBtn = document.getElementById("save-permissions-btn")
  const grantAllCheckbox = document.getElementById("grant-all-permissions")
  const specificCommandsSection = document.getElementById("specific-commands-section")
  const commandSearch = document.getElementById("command-search")

  // Close dialog handlers
  closeBtn.addEventListener("click", closeDialog)
  cancelBtn.addEventListener("click", closeDialog)

  // Close when clicking outside
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog()
    }
  })

  // Toggle specific commands section visibility
  grantAllCheckbox.addEventListener("change", () => {
    specificCommandsSection.style.display = grantAllCheckbox.checked ? "none" : "block"
  })

  // Search functionality
  commandSearch.addEventListener("input", filterCommands)

  // Save button handler
  saveBtn.addEventListener("click", () => {
    const adminId = dialog.dataset.adminId
    const permissions = getSelectedPermissions()

    if (onSave && typeof onSave === "function") {
      onSave(adminId, permissions)
    }

    closeDialog()
  })

  // Handle ESC key
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dialog.classList.contains("hidden")) {
      closeDialog()
    }
  })
}

/**
 * Open the admin permission dialog
 * @param {string} adminId - Admin ID to edit
 * @param {Array} commands - Array of available commands
 * @param {Array} currentPermissions - Current permissions for this admin
 */
export function openAdminPermissionDialog(adminId, commands, currentPermissions) {
  const dialog = document.getElementById("admin-permission-dialog")
  const adminIdDisplay = document.getElementById("admin-id-display")
  const grantAllCheckbox = document.getElementById("grant-all-permissions")
  const commandList = document.getElementById("command-list")
  const commandSearch = document.getElementById("command-search")

  // Set admin ID
  dialog.dataset.adminId = adminId
  adminIdDisplay.textContent = adminId

  // Reset search
  commandSearch.value = ""

  // Set "all" permission state
  const hasAllPermission = currentPermissions.includes("all")
  grantAllCheckbox.checked = hasAllPermission
  document.getElementById("specific-commands-section").style.display = hasAllPermission ? "none" : "block"

  // Filter commands to only include admin_only commands
  const adminCommands = commands.filter((cmd) => cmd.admin_only === true)

  // Populate command list
  commandList.innerHTML = ""

  if (adminCommands.length === 0) {
    const noCommandsMsg = document.createElement("div")
    noCommandsMsg.className = "col-span-2 py-4 text-center text-gray-500"
    noCommandsMsg.textContent = "No admin-only commands available"
    commandList.appendChild(noCommandsMsg)
  } else {
    adminCommands.forEach((command) => {
      const isChecked = currentPermissions.includes(command.name)
      const commandItem = document.createElement("div")
      commandItem.className = "flex items-center"
      commandItem.dataset.commandName = command.name.toLowerCase()
      commandItem.innerHTML = `
        <label class="inline-flex items-center w-full p-2 rounded hover:bg-gray-50">
          <input type="checkbox" class="command-checkbox w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" 
                 value="${command.name}" ${isChecked ? "checked" : ""}>
          <span class="ml-2 text-sm font-medium text-gray-900">${command.name}</span>
        </label>
      `
      commandList.appendChild(commandItem)
    })
  }

  // Show dialog
  dialog.classList.remove("hidden")

  // Focus search input
  setTimeout(() => {
    commandSearch.focus()
  }, 100)
}

/**
 * Close the admin permission dialog
 */
function closeDialog() {
  const dialog = document.getElementById("admin-permission-dialog")
  dialog.classList.add("hidden")
}

/**
 * Get selected permissions from the dialog
 * @returns {Array} Array of selected permissions
 */
function getSelectedPermissions() {
  const grantAllCheckbox = document.getElementById("grant-all-permissions")

  if (grantAllCheckbox.checked) {
    return ["all"]
  }

  const selectedCommands = []
  const checkboxes = document.querySelectorAll(".command-checkbox:checked")
  checkboxes.forEach((checkbox) => {
    selectedCommands.push(checkbox.value)
  })

  return selectedCommands
}

/**
 * Filter commands based on search input
 */
function filterCommands() {
  const searchInput = document.getElementById("command-search")
  const searchTerm = searchInput.value.toLowerCase()
  const commandItems = document.querySelectorAll("#command-list > div")
  const noCommandsMessage = document.getElementById("no-commands-message")

  let visibleCount = 0

  commandItems.forEach((item) => {
    const commandName = item.dataset.commandName
    if (commandName && commandName.includes(searchTerm)) {
      item.classList.remove("hidden")
      visibleCount++
    } else {
      item.classList.add("hidden")
    }
  })

  noCommandsMessage.classList.toggle("hidden", visibleCount > 0)
}
