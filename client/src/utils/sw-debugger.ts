// Service Worker Debug Utility
export class ServiceWorkerDebugger {
  static async unregisterAll() {
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        console.log(`🔧 Found ${registrations.length} service worker(s) to unregister`);
        
        for (const registration of registrations) {
          console.log('🗑️ Unregistering service worker:', registration.scope);
          await registration.unregister();
          console.log('✅ Service worker unregistered successfully');
        }
        
        // Clear all caches
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
          console.log('🧹 Clearing cache:', cacheName);
          await caches.delete(cacheName);
        }
        
        console.log('🎉 All service workers and caches cleared!');
        return true;
      } catch (error) {
        console.error('❌ Failed to unregister service workers:', error);
        return false;
      }
    } else {
      console.log('ℹ️ Service Workers not supported in this browser');
      return false;
    }
  }
  
  static async disableForSession() {
    if ('serviceWorker' in navigator) {
      // Unregister existing workers
      await this.unregisterAll();
      
      // Block new registrations for this session
      const originalRegister = navigator.serviceWorker.register;
      navigator.serviceWorker.register = function(...args) {
        console.log('🚫 Blocking service worker registration for debugging');
        return Promise.reject(new Error('Service worker registration blocked for debugging'));
      };
      
      console.log('🛡️ Service worker registration blocked for this session');
      return true;
    }
    return false;
  }
  
  static async enableForSession() {
    if ('serviceWorker' in navigator) {
      // Restore original register function
      if (navigator.serviceWorker.register.toString().includes('blocked for debugging')) {
        // This is a simple way to restore - in production you'd want a more robust approach
        location.reload();
      }
    }
  }
  
  static async getStatus() {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheNames = await caches.keys();
      
      return {
        supported: true,
        activeWorkers: registrations.length,
        caches: cacheNames.length,
        registrations: registrations.map(reg => ({
          scope: reg.scope,
          state: reg.active?.state || 'unknown'
        }))
      };
    }
    
    return { supported: false };
  }
}

// Global debug functions for console use
if (typeof window !== 'undefined') {
  (window as any).swDebugger = ServiceWorkerDebugger;
  
  // Auto-disable service workers in development
  if (process.env.NODE_ENV === 'development') {
    ServiceWorkerDebugger.disableForSession().then(() => {
      console.log('🔧 Development mode: Service Workers disabled for PDF debugging');
    });
  }
}