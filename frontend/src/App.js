import React, { useEffect, useState, useCallback } from 'react';

// Main App component
function App() {
  // State variables for managing tasks, input, loading, errors, and submission
  const [tasks, setTasks] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // State for the custom confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState(() => () => {}); // Function to execute on confirmation

  // NOTE: This API_BASE_URL assumes a backend server is running at this address.
  // For a self-contained Canvas app without a separate backend, you would typically
  // simulate API calls using local state or a mock API.
  const API_BASE_URL = 'http://localhost:5000/api';

  /**
   * Helper function for making API calls.
   * @param {string} endpoint - The API endpoint (e.g., '/tasks').
   * @param {object} options - Fetch options (method, headers, body, etc.).
   * @returns {Promise<object>} - The JSON response from the API.
   * @throws {Error} - If the network request fails or the response is not OK.
   */
  const apiCall = async (endpoint, options = {}) => {
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

      if (!response.ok) {
        // Attempt to parse error message from response body
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Return JSON data for successful responses
      return response.json();
    } catch (err) {
      // Re-throw the error for handleError to catch
      throw err;
    }
  };

  /**
   * Handles API call errors, logs them, and sets a user-friendly error message.
   * The error message clears after 5 seconds.
   * @param {Error} error - The error object.
   * @param {string} message - A user-friendly message describing the failure.
   */
  const handleError = useCallback((error, message) => {
    console.error(message, error);
    setError(error.message || 'Something went wrong');
    setTimeout(() => setError(null), 5000); // Clear error message after 5 seconds
  }, []);

  /**
   * Fetches tasks from the API.
   * Uses useCallback to memoize the function, preventing unnecessary re-renders.
   */
  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true); // Set loading state
      setError(null); // Clear any previous errors
      const data = await apiCall('/tasks'); // Make API call
      setTasks(data); // Update tasks state
    } catch (error) {
      handleError(error, 'Failed to fetch tasks'); // Handle errors during fetch
    } finally {
      setLoading(false); // Clear loading state
    }
  }, [handleError]); // Dependency array: fetchTasks depends on handleError

  // Effect hook to fetch tasks on component mount
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]); // Dependency array: runs once on mount, or if fetchTasks changes (which it won't due to useCallback)

  /**
   * Adds a new task to the list.
   * Includes input validation for empty text and length.
   */
  const addTask = async () => {
    const trimmedText = text.trim();

    // Input validation
    if (trimmedText === '') {
      setError('Please enter a task');
      setTimeout(() => setError(null), 3000);
      return;
    }
    if (trimmedText.length > 200) {
      setError('Task is too long (max 200 characters)');
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      setSubmitting(true); // Set submitting state
      setError(null); // Clear any previous errors
      const newTask = await apiCall('/tasks', {
        method: 'POST',
        body: JSON.stringify({ text: trimmedText }),
      });
      setTasks(prevTasks => [...prevTasks, newTask]); // Add new task to state
      setText(''); // Clear input field
    } catch (error) {
      handleError(error, 'Failed to add task'); // Handle errors during add
    } finally {
      setSubmitting(false); // Clear submitting state
    }
  };

  /**
   * Toggles the completion status of a task.
   * Implements optimistic updates for a snappier UI.
   * @param {string} id - The ID of the task to toggle.
   */
  const toggleComplete = async (id) => {
    // Optimistic update: update UI immediately
    setTasks(prevTasks =>
      prevTasks.map(task =>
        task._id === id ? { ...task, completed: !task.completed } : task
      )
    );

    try {
      // Make API call to update task on server
      const updatedTask = await apiCall(`/tasks/${id}`, {
        method: 'PUT',
      });
      // Update with server response (in case of discrepancies)
      setTasks(prevTasks =>
        prevTasks.map(task => (task._id === id ? updatedTask : task))
      );
    } catch (error) {
      // Revert optimistic update on API error
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task._id === id ? { ...task, completed: !task.completed } : task
        )
      );
      handleError(error, 'Failed to update task'); // Handle errors
    }
  };

  /**
   * Deletes a task after user confirmation.
   * Uses a custom confirmation modal.
   * @param {string} id - The ID of the task to delete.
   */
  const deleteTask = async (id) => {
    // Show custom confirmation modal
    setConfirmMessage('Are you sure you want to delete this task?');
    setConfirmAction(() => async () => { // Set the action to be performed on confirm
      // Optimistic update: remove task from UI immediately
      const taskToDelete = tasks.find(task => task._id === id);
      setTasks(prevTasks => prevTasks.filter(task => task._id !== id));

      try {
        await apiCall(`/tasks/${id}`, {
          method: 'DELETE',
        });
      } catch (error) {
        // Revert optimistic update on API error
        if (taskToDelete) {
          setTasks(prevTasks => [...prevTasks, taskToDelete]);
        }
        handleError(error, 'Failed to delete task'); // Handle errors
      }
    });
    setShowConfirmModal(true); // Display the modal
  };

  /**
   * Handles the Enter key press in the input field to add a task.
   * @param {object} e - The keyboard event object.
   */
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !submitting) {
      addTask();
    }
  };

  // Filter tasks into pending and completed categories
  const completedTasks = tasks.filter(task => task.completed);
  const pendingTasks = tasks.filter(task => !task.completed);

  /**
   * Handles clearing all completed tasks after confirmation.
   * Uses a custom confirmation modal.
   */
  const handleClearCompleted = () => {
    if (completedTasks.length === 0) return;

    setConfirmMessage(`Delete all ${completedTasks.length} completed tasks?`);
    setConfirmAction(() => async () => {
      // Optimistically remove all completed tasks
      const tasksToKeep = tasks.filter(task => !task.completed);
      const tasksToRemove = tasks.filter(task => task.completed);
      setTasks(tasksToKeep);

      try {
        // Iterate and delete each completed task
        await Promise.all(tasksToRemove.map(task => apiCall(`/tasks/${task._id}`, { method: 'DELETE' })));
      } catch (error) {
        // Revert if any deletion fails (consider more granular rollback for production)
        setTasks(prevTasks => [...prevTasks, ...tasksToRemove]);
        handleError(error, 'Failed to clear completed tasks');
      }
    });
    setShowConfirmModal(true);
  };

  // Render loading spinner while tasks are being fetched
  if (loading) {
    return (
      <div className="App">
        <div className="todo-wrapper">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading tasks...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    // Main application container
    <div className="App">
      {/* Neon & Glassmorphic Wrapper around the Todo List */}
      <div className="todo-wrapper">
        <h1>To-Do List</h1>

        {/* Task Counter Display */}
        <div className="task-counter-display">
          <span>
            <strong>{pendingTasks.length}</strong> pending
          </span>
          <span>
            <strong>{completedTasks.length}</strong> completed
          </span>
        </div>

        {/* Error Message Display */}
        {error && (
          <div className="error-message">
            <span>⚠️ {error}</span>
            <button className="close-error" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Input Section for adding new tasks */}
        <div className="input-container">
          <input
            type="text" // Explicitly define type
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="What needs to be done?"
            disabled={submitting}
            maxLength={200}
          />
          <button
            onClick={addTask}
            disabled={submitting || text.trim() === ''} // Disable if submitting or input is empty
          >
            <span>{submitting ? 'Adding...' : 'Add Task'}</span> {/* Text changes based on submitting state */}
          </button>
        </div>

        {/* Character Counter for input field */}
        <div className="char-counter">
          <span className={text.length >= 180 ? 'warning' : ''}>
            {text.length}/200 characters
          </span>
        </div>

        {/* Conditional rendering for tasks list or empty state */}
        {tasks.length === 0 ? (
          <div className="empty-state">
            <p>No tasks yet. Add one above to get started!</p>
          </div>
        ) : (
          <>
            {/* Pending Tasks Section */}
            {pendingTasks.length > 0 && (
              <div className="task-section pending-tasks">
                <h3>📝 Pending Tasks ({pendingTasks.length})</h3>
                <ul>
                  {pendingTasks.map(task => (
                    <TaskItem
                      key={task._id}
                      task={task}
                      onToggle={toggleComplete}
                      onDelete={deleteTask}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* Completed Tasks Section */}
            {completedTasks.length > 0 && (
              <div className="task-section completed-tasks">
                <h3> ✨ Completed Tasks ({completedTasks.length})</h3>
                <ul>
                  {completedTasks.map(task => (
                    <TaskItem
                      key={task._id}
                      task={task}
                      onToggle={toggleComplete}
                      onDelete={deleteTask}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* Main Action Buttons (Refresh, Clear Completed) */}
        {tasks.length > 0 && (
          <div className="main-actions">
            <button onClick={fetchTasks}>
              <span>♻️ Refresh</span>
            </button>
            {completedTasks.length > 0 && (
              <button
                onClick={handleClearCompleted} // Use custom handler for clear completed
                className="clear-completed-btn" // Add a class for specific styling if needed
              >
                <span>🗑️ Clear Completed ({completedTasks.length})</span>
              </button>
            )}
          </div>
        )}

        {/* Statistics Display */}
        {tasks.length > 0 && (
          <div className="stats-container">
            <div className="stat-item">
              <span>Total Tasks:</span>
              <span>{tasks.length}</span>
            </div>
            <div className="stat-item">
              <span>Progress:</span>
              <span>
                {tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Custom Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        message={confirmMessage}
        onConfirm={() => {
          confirmAction(); // Execute the stored action
          setShowConfirmModal(false); // Close modal
        }}
        onCancel={() => setShowConfirmModal(false)} // Close modal
      />
    </div>
  );
}

/**
 * TaskItem component displays an individual todo task.
 * @param {object} props - Component props.
 * @param {object} props.task - The task object.
 * @param {function} props.onToggle - Callback to toggle task completion.
 * @param {function} props.onDelete - Callback to delete the task.
 */
const TaskItem = ({ task, onToggle, onDelete }) => {
  return (
    <li className={task.completed ? 'done' : ''}> {/* Apply 'done' class for completed tasks */}
      <div className="task-content">
        <span
          className="task-text"
          onClick={() => onToggle(task._id)}
          title="Click to toggle completion"
        >
          {task.text}
        </span>
        <div className="task-meta">
          {task.createdAt && (
            <small>
              Added: {new Date(task.createdAt).toLocaleDateString()}
            </small>
          )}
        </div>
      </div>
      <div className="todo-actions">
        <button
          className="toggle-btn" // Specific class for toggle button
          onClick={() => onToggle(task._id)}
          title={task.completed ? 'Mark as pending' : 'Mark as completed'}
        >
          <span>{task.completed ? '↩️' : ' ✨'}</span>
        </button>
        <button
          className="delete-btn" // Specific class for delete button
          onClick={() => onDelete(task._id)}
          title="Delete task"
        >
          <span>🗑️</span>
        </button>
      </div>
    </li>
  );
};

/**
 * ConfirmationModal component for custom confirmation dialogs.
 * @param {object} props - Component props.
 * @param {boolean} props.isOpen - Whether the modal is open.
 * @param {string} props.message - The message to display in the modal.
 * @param {function} props.onConfirm - Callback for confirm action.
 * @param {function} props.onCancel - Callback for cancel action.
 */
const ConfirmationModal = ({ isOpen, message, onConfirm, onCancel }) => {
  if (!isOpen) return null; // Don't render if not open

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <p>{message}</p>
        <div className="modal-actions">
          <button className="confirm-yes-btn" onClick={onConfirm}>Yes</button>
          <button className="confirm-no-btn" onClick={onCancel}>No</button>
        </div>
      </div>
    </div>
  );
};

export default App;