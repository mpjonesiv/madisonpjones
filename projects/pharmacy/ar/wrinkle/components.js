AFRAME.registerComponent('color-randomizer', {
    init: function () {
      let colors = ["red", "green", "blue", "black", "orange", "white"]
      var el = this.el;

      var isVisible = el.getAttribute('visible');
      if (isVisible === 'true'){
       el.addEventListener('click', (e) => {
            el.setAttribute('color', colors[Math.floor(Math.random() * colors.length)]);
            console.log("I am clicked")
        });
      }
    }
  });