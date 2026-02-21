<script>
    window.addEventListener('error', function(event) {
    const errorDisplay = document.createElement('div');
    errorDisplay.style.position = 'fixed';
    errorDisplay.style.top = '0';
    errorDisplay.style.left = '0';
    errorDisplay.style.width = '100%';
    errorDisplay.style.backgroundColor = 'red';
    errorDisplay.style.color = 'white';
    errorDisplay.style.padding = '20px';
    errorDisplay.style.zIndex = '9999';
    errorDisplay.innerText = 'Global Error: ' + event.message + ' at ' + event.filename + ':' + event.lineno;
    document.body.appendChild(errorDisplay);
  });
</script>
