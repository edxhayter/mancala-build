//! The bridge between the Rust game (`mancala-core`, `mancala-ai`) and the web page.
//! Everything JavaScript can call is marked `#[wasm_bindgen]`.

use wasm_bindgen::prelude::*;

/// This crate's version, e.g. "0.1.0". A first function to prove the
/// Rust → WASM → JavaScript pipeline works end to end.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_matches_cargo_toml() {
        assert_eq!(version(), "0.1.0");
    }
}
