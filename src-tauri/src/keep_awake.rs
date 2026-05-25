use std::sync::atomic::{AtomicBool, Ordering};

static OUTPUT_HELD: AtomicBool = AtomicBool::new(false);
static PRESENTATION_HELD: AtomicBool = AtomicBool::new(false);
static APPLIED: AtomicBool = AtomicBool::new(false);

pub fn set_output_active(active: bool) {
    OUTPUT_HELD.store(active, Ordering::Release);
    sync_power_state();
}

pub fn set_presentation_active(active: bool) {
    PRESENTATION_HELD.store(active, Ordering::Release);
    sync_power_state();
}

fn sync_power_state() {
    let want = OUTPUT_HELD.load(Ordering::Acquire) || PRESENTATION_HELD.load(Ordering::Acquire);
    let applied = APPLIED.load(Ordering::Acquire);

    if want && !applied {
        platform::prevent_idle_sleep();
        APPLIED.store(true, Ordering::Release);
    } else if !want && applied {
        platform::allow_idle_sleep();
        APPLIED.store(false, Ordering::Release);
    }
}

mod platform {
    #[cfg(target_os = "windows")]
    pub fn prevent_idle_sleep() {
        const ES_CONTINUOUS: u32 = 0x8000_0000;
        const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
        const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;

        #[link(name = "kernel32")]
        extern "system" {
            fn SetThreadExecutionState(es_flags: u32) -> u32;
        }

        unsafe {
            SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
        }
    }

    #[cfg(target_os = "windows")]
    pub fn allow_idle_sleep() {
        const ES_CONTINUOUS: u32 = 0x8000_0000;

        #[link(name = "kernel32")]
        extern "system" {
            fn SetThreadExecutionState(es_flags: u32) -> u32;
        }

        unsafe {
            SetThreadExecutionState(ES_CONTINUOUS);
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn prevent_idle_sleep() {}

    #[cfg(not(target_os = "windows"))]
    pub fn allow_idle_sleep() {}
}
