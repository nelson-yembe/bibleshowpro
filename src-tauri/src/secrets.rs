//! Secrets held for the operator (today, the Gemini API key), kept in the Windows
//! Credential Manager rather than the app database. The database is copied into backups
//! and readable by anyone with the file; the credential store is per Windows user.

use std::cell::RefCell;
use std::collections::HashMap;

/// Credential Manager entries are listed under this name.
const SERVICE: &str = "com.bibleshowpro.app";

pub const GEMINI_API_KEY: &str = "gemini-api-key";

pub trait SecretStore {
    fn get(&self, name: &str) -> Result<Option<String>, String>;
    fn set(&self, name: &str, value: &str) -> Result<(), String>;
    fn delete(&self, name: &str) -> Result<(), String>;
}

/// The operating system's credential store.
pub struct OsSecretStore;

impl SecretStore for OsSecretStore {
    fn get(&self, name: &str) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Could not read from Windows Credential Manager: {e}")),
        }
    }

    fn set(&self, name: &str, value: &str) -> Result<(), String> {
        keyring::Entry::new(SERVICE, name)
            .and_then(|entry| entry.set_password(value))
            .map_err(|e| format!("Could not save to Windows Credential Manager: {e}"))
    }

    fn delete(&self, name: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Could not remove from Windows Credential Manager: {e}")),
        }
    }
}

/// An in-memory store for tests, so they never touch a real user's credentials.
#[derive(Default)]
pub struct MemorySecretStore {
    values: RefCell<HashMap<String, String>>,
}

impl SecretStore for MemorySecretStore {
    fn get(&self, name: &str) -> Result<Option<String>, String> {
        Ok(self.values.borrow().get(name).cloned())
    }

    fn set(&self, name: &str, value: &str) -> Result<(), String> {
        self.values.borrow_mut().insert(name.to_string(), value.to_string());
        Ok(())
    }

    fn delete(&self, name: &str) -> Result<(), String> {
        self.values.borrow_mut().remove(name);
        Ok(())
    }
}

/// Store `value` under `name`, or remove the entry when it is blank.
pub fn put(store: &dyn SecretStore, name: &str, value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        store.delete(name)
    } else {
        store.set(name, value)
    }
}
