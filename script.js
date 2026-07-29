(function () {
    var btn = document.getElementById('back-to-top');
    if (!btn) return;

    var threshold = 400;

    function onScroll() {
        btn.classList.toggle('visible', window.scrollY > threshold);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    btn.addEventListener('click', function () {
        var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
})();
