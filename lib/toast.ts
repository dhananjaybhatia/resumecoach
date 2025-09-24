import { toast as sonnerToast } from "sonner";

// Custom toast function with Animated Toast styling
export const toast = {
    success: (message: string) => {
        sonnerToast.success(message);
    },

    error: (message: string) => {
        sonnerToast.error(message);
    },

    warning: (message: string) => {
        sonnerToast.warning(message);
    },

    info: (message: string) => {
        sonnerToast.info(message);
    },
};
