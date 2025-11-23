// humanizer.js
// =========================================
// Front-end logic for AI → Humanized Content Studio
// Now wired to backend /api/humanize
// =========================================

document.addEventListener("DOMContentLoaded", () => {
    // Year in footer
    const yearEl = document.getElementById("year");
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }

    // Mobile nav toggle
    const nav = document.getElementById("nav");
    const navToggle = document.getElementById("navToggle");
    if (nav && navToggle) {
        navToggle.addEventListener("click", () => {
            nav.classList.toggle("open");
        });
    }

    // Fade-in on scroll
    const fadeEls = document.querySelectorAll(".fade-in");
    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15 }
        );

        fadeEls.forEach((el) => observer.observe(el));
    } else {
        fadeEls.forEach((el) => el.classList.add("visible"));
    }

    // Tabs (content type)
    const tabs = document.querySelectorAll(".humanizer-tab");
    let currentContentType = "blog";
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            currentContentType = tab.dataset.contentType || "blog";
        });
    });

    // Elements
    const inputEl = document.getElementById("aiInput");
    const outputEl = document.getElementById("humanOutput");
    const inputCharCount = document.getElementById("inputCharCount");
    const outputCharCount = document.getElementById("outputCharCount");
    const toneSelect = document.getElementById("toneSelect");
    const lengthSelect = document.getElementById("lengthSelect");
    const seoKeywordsInput = document.getElementById("seoKeywords");
    const toggleSimplify = document.getElementById("toggleSimplify");
    const toggleDeBuzz = document.getElementById("toggleDeBuzz");
    const toggleHints = document.getElementById("toggleHints");
    const qualityFill = document.getElementById("qualityFill");
    const qualityScore = document.getElementById("qualityScore");
    const btnHumanize = document.getElementById("btnHumanize");
    const btnClear = document.getElementById("btnClear");
    const btnCopy = document.getElementById("btnCopy");
    const btnPaste = document.getElementById("btnPaste");

    const variantA = document.getElementById("variantA");
    const variantB = document.getElementById("variantB");
    const variantC = document.getElementById("variantC");
    const variantCopyButtons = document.querySelectorAll("[data-variant-target]");

    // Helpers: character counts
    function updateCharCount(el, labelEl) {
        if (!el || !labelEl) return;
        const len = (el.value || "").length;
        labelEl.textContent = `${len} characters`;
    }

    if (inputEl && inputCharCount) {
        inputEl.addEventListener("input", () =>
            updateCharCount(inputEl, inputCharCount)
        );
        updateCharCount(inputEl, inputCharCount);
    }

    if (outputEl && outputCharCount) {
        outputEl.addEventListener("input", () =>
            updateCharCount(outputEl, outputCharCount)
        );
        updateCharCount(outputEl, outputCharCount);
    }

    // Copy main output
    if (btnCopy && outputEl) {
        btnCopy.addEventListener("click", async () => {
            const text = outputEl.value;
            if (!text.trim()) return;
            try {
                await navigator.clipboard.writeText(text);
                const original = btnCopy.textContent;
                btnCopy.textContent = "Copied";
                setTimeout(() => {
                    btnCopy.textContent = original || "Copy output";
                }, 1200);
            } catch (e) {
                console.error("Clipboard error", e);
            }
        });
    }

    // Copy variants
    variantCopyButtons.forEach((btn) => {
        btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-variant-target");
            const el = id ? document.getElementById(id) : null;
            if (!el) return;
            const text = el.textContent || "";
            if (!text.trim()) return;
            try {
                await navigator.clipboard.writeText(text);
                const original = btn.textContent;
                btn.textContent = "Copied";
                setTimeout(() => {
                    btn.textContent = original || "Copy";
                }, 1200);
            } catch (e) {
                console.error("Clipboard error", e);
            }
        });
    });

    // Paste from clipboard
    if (btnPaste && inputEl && navigator.clipboard) {
        btnPaste.addEventListener("click", async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    inputEl.value = text;
                    updateCharCount(inputEl, inputCharCount);
                }
            } catch (e) {
                console.error("Clipboard read error", e);
            }
        });
    }

    // Clear
    if (btnClear && inputEl && outputEl) {
        btnClear.addEventListener("click", () => {
            inputEl.value = "";
            outputEl.value = "";
            updateCharCount(inputEl, inputCharCount);
            updateCharCount(outputEl, outputCharCount);
            if (qualityFill) qualityFill.style.width = "0%";
            if (qualityScore) qualityScore.textContent = "–";
            if (variantA) variantA.textContent = "Run the tool to see this variant.";
            if (variantB) variantB.textContent = "Run the tool to see this variant.";
            if (variantC) variantC.textContent = "Run the tool to see this variant.";
        });
    }

    function setLoadingState(isLoading) {
        if (!btnHumanize) return;
        if (isLoading) {
            btnHumanize.disabled = true;
            btnHumanize.textContent = "Humanizing…";
        } else {
            btnHumanize.disabled = false;
            btnHumanize.textContent = "Humanize Content";
        }
    }

    function updateVariantsFromApi(data) {
        if (!data) return;
        if (variantA) {
            variantA.textContent =
                data.variantA ||
                data.output ||
                "Shorter variant will appear here after you humanize your content.";
        }
        if (variantB) {
            variantB.textContent =
                data.variantB ||
                data.output ||
                "Conversational variant will appear here after you humanize your content.";
        }
        if (variantC) {
            variantC.textContent =
                data.variantC ||
                "Summary bullets will appear here after you humanize your content.";
        }
    }

    // Main: call backend API
    async function callHumanizeApi() {
        if (!inputEl || !outputEl) return;

        const raw = inputEl.value || "";
        if (!raw.trim()) {
            outputEl.value = "";
            updateCharCount(outputEl, outputCharCount);
            if (qualityFill) qualityFill.style.width = "0%";
            if (qualityScore) qualityScore.textContent = "–";
            updateVariantsFromApi(null);
            return;
        }

        const seoKeywords = (seoKeywordsInput?.value || "")
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean);

        const payload = {
            text: raw,
            tone: toneSelect?.value || "neutral",
            length: lengthSelect?.value || "original",
            seoKeywords,
            contentType: currentContentType,
            simplify: !!(toggleSimplify && toggleSimplify.checked),
            deBuzz: !!(toggleDeBuzz && toggleDeBuzz.checked),
            showHints: !!(toggleHints && toggleHints.checked)
        };

        setLoadingState(true);

        try {
            const response = await fetch("/api/humanize", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.error("API error", errData);
                outputEl.readOnly = false;
                outputEl.value =
                    errData.error ||
                    "Something went wrong while processing your request. Please try again.";
                updateCharCount(outputEl, outputCharCount);
                if (qualityFill) qualityFill.style.width = "0%";
                if (qualityScore) qualityScore.textContent = "–";
                updateVariantsFromApi(null);
                return;
            }

            const data = await response.json();

            const output = (data.output || "").trim();
            outputEl.readOnly = false; // allow manual edits
            outputEl.value = output;
            updateCharCount(outputEl, outputCharCount);

            const score =
                typeof data.readabilityScore === "number"
                    ? data.readabilityScore
                    : undefined;
            if (qualityFill && typeof score === "number") {
                const clamped = Math.max(0, Math.min(100, score));
                qualityFill.style.width = `${clamped}%`;
            }
            if (qualityScore && typeof score === "number") {
                qualityScore.textContent = `${score}/100`;
            } else if (qualityScore) {
                qualityScore.textContent = "–";
            }

            updateVariantsFromApi(data);
        } catch (err) {
            console.error("Network error", err);
            outputEl.readOnly = false;
            outputEl.value =
                "Network error while calling the humanizer API. Please check your server and try again.";
            updateCharCount(outputEl, outputCharCount);
            if (qualityFill) qualityFill.style.width = "0%";
            if (qualityScore) qualityScore.textContent = "–";
            updateVariantsFromApi(null);
        } finally {
            setLoadingState(false);
        }
    }

    if (btnHumanize) {
        btnHumanize.addEventListener("click", () => {
            callHumanizeApi();
        });
    }
});
