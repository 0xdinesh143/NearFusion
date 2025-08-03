import toast from "react-hot-toast";

export type ToastType = 'success' | 'error' | 'info' | 'loading';

export interface ToastOptions {
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}

/**
 * Show a toast notification
 */
export const showToast = (
  title: string, 
  description?: string, 
  type: ToastType = 'info',
  options?: ToastOptions
) => {
  const message = description ? `${title}: ${description}` : title;
  
  const toastOptions = {
    duration: options?.duration,
    position: options?.position,
  };

  switch (type) {
    case 'success':
      return toast.success(message, toastOptions);
    case 'error':
      return toast.error(message, toastOptions);
    case 'loading':
      return toast.loading(message, toastOptions);
    case 'info':
    default:
      return toast(message, toastOptions);
  }
};

/**
 * Show a success toast
 */
export const showSuccess = (message: string, description?: string, options?: ToastOptions) => {
  return showToast(message, description, 'success', options);
};

/**
 * Show an error toast
 */
export const showError = (message: string, description?: string, options?: ToastOptions) => {
  return showToast(message, description, 'error', options);
};

/**
 * Show an info toast
 */
export const showInfo = (message: string, description?: string, options?: ToastOptions) => {
  return showToast(message, description, 'info', options);
};

/**
 * Show a loading toast
 */
export const showLoading = (message: string, description?: string, options?: ToastOptions) => {
  return showToast(message, description, 'loading', options);
};

/**
 * Show a promise toast that automatically handles loading, success, and error states
 */
export const showPromiseToast = <T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: unknown) => string);
  },
  options?: ToastOptions
) => {
  return toast.promise(promise, messages, {
    ...options,
    style: {
      minWidth: '250px',
    },
  });
};

/**
 * Dismiss a specific toast
 */
export const dismissToast = (toastId: string) => {
  toast.dismiss(toastId);
};

/**
 * Dismiss all toasts
 */
export const dismissAllToasts = () => {
  toast.dismiss();
};