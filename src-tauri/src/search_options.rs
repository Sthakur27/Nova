use regex::{Regex, RegexBuilder};
use serde::Deserialize;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchSpec {
    pattern: String,
    case_sensitive: bool,
    include: String,
    exclude: String,
}
pub(crate) struct Matcher {
    pattern: Regex,
    include: Option<Regex>,
    exclude: Option<Regex>,
}
impl Matcher {
    pub(crate) fn new(query: &str, spec: Option<SearchSpec>) -> Result<Self, String> {
        let spec = spec.unwrap_or_else(|| SearchSpec {
            pattern: regex::escape(query.trim()), ..SearchSpec::default()
        });
        let compile_path = |value: &str| {
            if value.is_empty() { Ok(None) }
            else { Regex::new(value).map(Some).map_err(|e| format!("Invalid file filter: {e}")) }
        };
        Ok(Self {
            pattern: RegexBuilder::new(&spec.pattern).case_insensitive(!spec.case_sensitive)
                .build().map_err(|e| format!("Invalid or unsupported regex: {e}"))?,
            include: compile_path(&spec.include)?,
            exclude: compile_path(&spec.exclude)?,
        })
    }
    pub(crate) fn has_path_filters(&self) -> bool { self.include.is_some() || self.exclude.is_some() }
    pub(crate) fn matches(&self, text: &str) -> bool { self.pattern.is_match(text) }
    pub(crate) fn accepts_path(&self, path: &str) -> bool {
        self.include.as_ref().is_none_or(|p| p.is_match(path))
            && !self.exclude.as_ref().is_some_and(|p| p.is_match(path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn search_options_combine_patterns_and_file_filters() {
        let spec = serde_json::from_value(serde_json::json!({
            "pattern": "\\b(?:c[ao]t)\\b", "caseSensitive": true,
            "include": "^(?:.*/)?[^/]*\\.md(?:/.*)?$",
            "exclude": "(?:^|/)archive(?:/.*)?$"
        })).unwrap();
        let matcher = Matcher::new("c[ao]t", Some(spec)).unwrap();
        assert!(matcher.matches("a cat and cot"));
        assert!(!matcher.matches("Cat cats"));
        assert!(matcher.accepts_path("notes/draft.md"));
        assert!(matcher.accepts_path("draft.md"));
        assert!(!matcher.accepts_path("archive/draft.md"));
        assert!(!matcher.accepts_path("draft.txt"));
    }
    #[test]
    fn search_options_report_unsupported_regex() {
        let spec = SearchSpec { pattern: "(?=cat)".into(), ..SearchSpec::default() };
        assert!(Matcher::new("", Some(spec)).is_err());
    }
}
