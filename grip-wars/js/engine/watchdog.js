// Watchdog: if the game never came up (script blocked, crash before the
// loader ran) replace the endless loading screen with an explanation.
setTimeout(() => {
  const boot = document.getElementById('boot');
  if (window.__UFC__ || !boot) return;
  boot.innerHTML = '<div class="logo"><span>UFC</span></div><p>Игра не запустилась.</p><p style="max-width:520px;text-align:center;line-height:1.5">Откройте её через «ИГРАТЬ UFC.cmd» (адрес http://127.0.0.1:5310/) в Chrome или Edge. ' +
    'Если открываете внутри другого приложения или вкладки предпросмотра — откройте ссылку в обычном браузере.</p><button class="btn primary" onclick="location.reload()">Перезагрузить</button>';
}, 12000);
