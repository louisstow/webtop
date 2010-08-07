//assign these objects to a namespace, defaults to window
(function(parent) {

/**
* Creates string of element
* @param tag The element to add
* @param options An object of attributes to add
* @param child ... n Child elements to nest
* @return HTML string to use with innerHTML
*/
var e = function(tag, options) {
	var html = '<'+tag;
	var children = Array.prototype.slice.apply(arguments, [(typeof options === "string") ? 1 : 2]);
	
	if(options && typeof options !== "string") {
		for(var option in options) {
			if(options.hasOwnProperty(option)) {
				html += ' '+option+'="'+options[option]+'"';
			}
		}
	}
	
	html += '>';
	for(var i = 0, l=children.length; i < l; i++) {
		html += children[i];
	}
	html += '</'+tag+'>';
	return html;
};

//array of tags as shorthand for e(<tag>)
var tags = "div span strong cite em li ul ol table th tr td input form textarea a button iframe".split(" "), i=0;
for(; i < tags.length; i++) {
	(function(el) { //create closure to keep EL in scope
		parent[el] = function(args) {
			args = Array.prototype.slice.call(arguments);
			args.unshift(el);
			return e.apply(this, args);
		};
	})(tags[i]);
}

//assign e to parent
parent.e = e;
})(window);