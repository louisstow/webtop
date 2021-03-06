(function($, window, undefined) {

/**
* Webtop Namespace
* uses closure for private members
*/
var Webtop = (function() {
		//Private methods and properties
		var tasks = [], //array of current tasks
			handlers = [], //array of event handlers
			rhandlers = [], //array of route handlers
			z = 0, //z-index counter
			guid = 1, //unique ID for general use
			doc = window.document,
			PX = "px",
			pint = parseInt,
			splice = Array.prototype.splice,
			canvas, //Raphael
			routes = [], //Array of app associations or 'routes'
			$canvas, //cached canvas jQ obj
			line, //active line
			nop = function(evt) { evt.preventDefault(); };
			//READ ONLY constants
			consts = {
				HEADER_HEIGHT: 25, //height of window header in PX
				TASK_BAR_HEIGHT: 50, //height of the taskbar
				DEFAULT: 1,
				MAXIMIZED: 2,
				
				//Events
				NEW_TASK: 0,
				RIGHT_CLICK: 1,
				TASK_MINIMIZED: 3,
				TASK_MAXIMIZED: 4,
				TASK_RESTORED: 5
			};
		
		$(doc).ready(function() {
			startup();
		});
		
		/**
		* Function called on first load
		*/
		function startup() {
			$(doc.body).bind("selectstart", nop);
			canvas = new Raphael("canvas",0, 0, $(window).width(), $(window).height());
			$canvas = $("#canvas");
		}
		
		/**
		* Start drawing a line
		*/
		function startLine(e, index, isInput) {
			x = e.pageX;
			y = e.pageY;
			line = new Line(x, y, canvas, index, isInput);
			$canvas.bind('mousemove', function(e,c) {
				var e = c || e; //accept the parent event over default
				x = e.pageX;
				y = e.pageY;
				if(line) line.updateEnd(x, y);
			});
			$canvas.mouseup(function(e) {
				if(line) {
					line.destroy();
					line = null;
				}
			});
			return line;
		}
		
		function updateLines(lines, $input, $output) {
			if(lines.length) {
				var ipos = $input.offset(), opos = $output.offset(), 
					co = [ipos.left, ipos.top, opos.left, opos.top],
					current;
				for(var i = 0; i < lines.length; i++) {
					current = lines[i];
					if(current.i) { //input
						current.s ? lines[i].l.updateStart(co[0] + 10, co[1] + 15) :
									lines[i].l.updateEnd(co[0] + 10, co[1] + 15);
					} else { //output
						current.s ? lines[i].l.updateStart(co[2] + 15, co[3] + 15) :
									lines[i].l.updateEnd(co[2] + 15, co[3] + 15);
					}
				}
			}
		}
		
		/**
		* Check if a route exists
		* @param from Task index from
		* @param to Task index to
		* @return Boolean if exists or not
		*/
		function hasRoute(from, to) {
			var i = 0, l = routes.length;
			for(;i<l;i++) {
				if(routes[i][0] == from && routes[i][1] == to) {
					return true;
				}
			}
			return false;
		}
		
		//Public methods and properties
		return {
		
			/**
			* Get a running app by its task index
			* @param id Task index
			* @return Object Window manipulation methods
			*/
			get: function(id) {
				var app = tasks[id];
				return {
					/**
					* Close the window
					*/
					close: function() {
						if(app) {
							doc.body.removeChild(app.node);
							delete tasks[id]; //remove from tasks array
							z--;
						}
						Webtop.events.dispatch(Webtop.c('NEW_TASK'));
						Webtop.route.destroyAll(id);
					},
					
					/**
					* Toggle the maximized state of the window
					*/
					maximize: function() {
						if(app.state !== Webtop.c('MAXIMIZED')) {
							var h = $(window).height() - Webtop.c('TASK_BAR_HEIGHT') + PX;
							$(app.node).css({width: "100%", height: h, left: "0px", top: "0px"});
							$("div.window-inner",app.node).css({height: h, width: "100%"});
							app.state = Webtop.c('MAXIMIZED');
							app.node.style.zIndex = z++;
							
							$(app.node).draggable("option","disabled", true).resizable("option", "disabled", true);
						} else {
							this.restore();
							$(app.node).draggable("option","disabled", false).resizable("option", "disabled", false);
						}
					},
					
					/**
					* Minimize the window
					*/
					minimize: function() {
						$(app.node).hide("fast");
						app.state *= -1; //flip the state
					},
					
					/**
					* Focus the window by bringing to front and making visible
					*/
					focus: function() {
						$(app.node).show("fast");
						app.node.style.zIndex = z++;
					},
					
					/**
					* Restore the window from minimized state
					*/
					restore: function() {
						this.focus();
						if(app.state === Webtop.c('MAXIMIZED')) { //if task wasn't maximized
							$(app.node).css({width: app.dim.w, height: app.dim.h + PX, left: app.dim.x + PX, top: app.dim.y + PX});
							
							var w = $('div.window-inner', app.node),
								h = w.hasClass("full") ? 0 : Webtop.c('HEADER_HEIGHT'); //if has class full, header isn't visible
							
							w.css({width: app.dim.w, height:app.dim.h - h + PX});
							app.state = Webtop.c('DEFAULT');
						}
						app.state = Math.abs(app.state);
					},
					
					route: {
						out: function(msg) {
							var h, i = 0, l = routes.length, j, hl;
							
							for(;i<l;i++) {
								if(routes[i][0] === id) {
									//Loop over handlers
									j=0;
									h = rhandlers[routes[i][1]];
									hl = h.length;
									
									for(;j<h.length;j++)
										h[j](msg);
								}
							}
						},
						
						into: function(callback) {
							if(rhandlers[id] === undefined) rhandlers[id] = []; //init handler array
							rhandlers[id].push(callback);
						}
					},
					
					id: id
				};
			},
			
			/**
			* Run an application
			* @param id ID of the application
			*/
			run: function(id) {
				//Create the root DIV
				var obj = doc.createElement("div"), 
					$obj = $(obj),
					options = APPLIST[id],
					index = tasks.length,
					$input, //jQ cached
					$output,
					lines = []; //lines
				
				if(options.single) { //if single instance, look for one opened
					var found = this.api.findTask(id);
					if(found) {
						this.get(found[0]).restore();
						return;
					}
				}
				
				obj.id = "app"+index;
				$obj.addClass("window").css({width: options.width, height: options.height + PX, zIndex: (options.alwaysOntop ? 1000 : z++)})
					.html(
						(options.route !== false ? em({'class': 'input'}) + em({'class': 'output'}) : '')
						+div({"class": "window-header"},
							strong(options.title), 
							span(a({"class": "min"}),a({"class": "max"}),a({"class": "close"})))
						+div({"class": "window-inner loading"})
					);
				
				//apply user defined CSS on the main window
				if(options.css) {
					$obj.css(options.css);
				}
				//push the task to the task list
				tasks.push({id: id, node: obj, dim: {w: options.width, h: options.height, x: 10, y: 10}, state: Webtop.c('DEFAULT')});
				
				//create the iframe
				var iframe = doc.createElement("iframe"), inner = $('div.window-inner', obj);
				
				$(iframe).attr({frameBorder: '0', allowTransparency: 'true', src: options.src}).hide();
				//"app.php?id="+id+"&c="+(new Date()).getTime() // src: ... })
				
				inner.append(iframe).css("height", options.height - Webtop.c('HEADER_HEIGHT') + PX);
				
				//Remove the header
				if(options.header === false) {
					$('div.window-header',obj).addClass("hidden");
					inner.addClass("full").css("height",options.height);
				}
				doc.body.appendChild(obj);
				
				//Create closure of apps window controls
				var controls = this.get(tasks.length-1);
				$("a.min",obj).click(function(){ controls.minimize(); });
				$("a.max",obj).click(function(){ controls.maximize(); });
				$("a.close",obj).click(function() { controls.close(); });
				
				//Give the iframe access to Webtop
				var iwin = iframe.contentWindow || iframe.contentDocument, $iframe = $(iframe);
				iwin.Webtop = Webtop;
				iwin.App = controls;
				
				//When loading is finished, display iframe
				$iframe.load(function() {
					inner.removeClass("loading");
					$iframe.show();
				});
				
				//Add events
				var startGhost = function(context) { $iframe.hide(); $(context).addClass("drag"); },
					stopGhost = function(context) { $iframe.show(); $(context).removeClass("drag"); };
				$("div.window-header", obj)
					.bind("dragstart", nop)
					.bind("selectstart", nop)
					.bind("mousedown", function() { controls.focus(); })
					.dblclick(function() { controls.maximize(); });
				
				if(options.routes !== false) {
					//Start the line draw on node mousedown
					var $ems = $("em",obj);
					$input = $($ems[0]);
					$output = $($ems[1]);
					
					$ems.bind("dragstart",nop).bind("selectstart",nop).mousedown(function(e) {
						var isInput = $(this).hasClass("input");
						line = startLine(e, index, isInput);	
						lines.push({l: line, i: isInput, s: true});
					}).mouseup(function() {
						$canvas.unbind('mousemove');
						var arr, flag = true;
						
						//correct ordering: [output, input]
						if(!line) return;
						if(line.getIndex() == index) flag = false;
						if($(this).hasClass("input")) { //input
							//check if route exists or is the wrong node
							if(hasRoute(line.getIndex(), index) || line.isInput()) {
								flag = false;
							}
							arr = [line.getIndex(),index,line];
						} else { //if output
							if(hasRoute(index,line.getIndex()) || !line.isInput()) {
								flag = false;
							}
							arr = [index,line.getIndex(),line];
						}
						if(flag) {
							routes.push(arr);
							lines.push({l: line, i: $(this).hasClass("input"), s: false});
							line.setRoute(arr);
						} else line.destroy();
						line = null;
					}).mousemove(function(e) {
						$canvas.trigger('mousemove',e);
					}).mouseover(function(e) {
						//If compatible node, display over graphic
						if(line && line.getIndex() !== index &&
							($(this).hasClass("input") && !(hasRoute(line.getIndex(), index) || line.isInput()) ||
							$(this).hasClass("output") && !(hasRoute(index, line.getIndex()) || !line.isInput()))) {
							
							$(this).addClass("over");
						}
					}).mouseout(function(e) {
						$(this).removeClass("over");
					});
				}
				
				if(options.draggable !== false) {
					$obj.draggable({handle: "div.window-header", scroll:false, containment:'document',
						start: function() {
							startGhost(this);
							$canvas.hide();
						},
						
						stop: function() {
							$canvas.show();
							stopGhost(this);
							//update the position of the task
							var co = [pint($(this).css("left")), pint($(this).css("top")), $(this).width()];
							
							tasks[index].dim.x = co[0];
							tasks[index].dim.y = co[1];
							
							updateLines(lines, $input, $output);
						}
					});
				}
				
				if(options.resizable !== false) {
					$obj.resizable({containment:'document', autoHide: true, alsoResize: inner,
						start: function() {
							startGhost(this);
							$canvas.hide();
							if(tasks[index].state === Webtop.c('MAXIMIZED')) {
								controls.maximize();
							}
						}, 
						stop: function() {
							stopGhost(this);
							$canvas.show();
							//update the dimensions of the task
							tasks[index].dim.w = $(this).css("width");
							tasks[index].dim.h = parseInt($(this).css("height"),10);
							
							updateLines(lines, $input, $output);
						}
					});
				}
				//last but not least, fire event
				Webtop.events.dispatch(Webtop.c('NEW_TASK')); 
			},
			
			
			
			api: {
				findTask: function(id) {
					var found = [], i = 0, l;
					for(l = tasks.length; i < l; i++) {
						if(tasks[i] && tasks[i].id === id) {
							found.push(i);
						}
					}
					return found.length > 0 ? found : false;
				},
				
				getTasks: function() {
					return tasks;
				},
				
				taskOptions: function(id) {
					return APPLIST[id];
				}
			},
			
			events: {
			
				attach: function(obj, id, handler) {
					if(handlers[id] === undefined) handlers[id] = []; //init handler array
					handlers[id].push({obj: obj, handler: handler});
					
				},
				
				dispatch: function(id, value) {
					
					var h = handlers[id], i = 0, l, attached;
					if(h !== undefined) {
						for(l = h.length; i<l; i++) {
							attached = h[i];
							attached.handler.apply(attached.obj, [value]);
						}
					}
				}
			},
			
			/**
			* Return a constant
			*/
			c: function(name) {
				return consts[name];
			},
			
			route: {
				/**
				* Destroy a link between two apps
				*/
				destroy: function(from, to) {
					var i = 0, l = routes.length;
					for(;i<l;i++) {
						if(routes[i][0] === from && routes[i][1] === to) {
							//remove from array
							routes[i][2].destroy();
							routes.splice(i,1);
							break;
						}
					}
				},
				
				destroyAll: function(id) {
					var i = 0;
					for(;i<routes.length;i++) {
						if(routes[i] !== undefined && routes[i][0] === id || routes[i][1] === id) {
							//remove from array
							routes[i][2].destroy();
							routes.splice(i,1);
							i--;
						}
					}
				},
				
				/**
				* Create a route between two apps
				*/
				create: function(from, to) {
					routes.push([from, to]);
				}
			},
			
			routes: function() {
				return routes;
			},
			
			/**
			* Context menu
			* @example Webtop.cm({ }, $('#context-menu'))
			*/
			cm: function(menu, trigger, parent) {
				//create a fragement to append the menu items to
				var container = doc.createDocumentFragment();
				if(!parent) {
					var parent = doc.createElement('ul');
					
					doc.body.appendChild(parent);
					$(parent).addClass('ui-context-menu').hide();
					trigger.oncontextmenu = function() { return false; };
					$(trigger).mousedown(function(e) {
						if(e.which === 3){
							e.preventDefault();
							$(parent).show();
							return false;
						}
					});
				}
				
				for(var item in menu) {
					var child = doc.createElement("li");
					
					$(child).text(item).click(function() {
						$("ul:first",this).show("fast").mousedown(function(e) { e.stopPropagation(); });
						
						var that = this;
						$(this).parent().mousedown(function() { $("ul",that).hide("fast"); });
						$(doc).mousedown(function() { $("ul:first",that).hide("fast"); $(that).parent().hide("fast"); });
						return false;
					}).mousedown(function(e) { e.stopPropagation(); });
					
					container.appendChild(child);
					var cached = menu[item]; //set a reference
					
					//set the onclick if item is a function
					if($.isFunction(cached)) {
						child.onclick = cached;
					} else if($.isPlainObject(cached)) { //if its an object, go a level deeper
						var childparent = doc.createElement("ul");
						childparent.setAttribute("class", "ui-menu-bar-root");
						child.appendChild(childparent);
						this.cm(cached, trigger, childparent);
					}
				}
				
				parent.appendChild(container);
				//return this;
			}
		};
})();

/**
* Generate a random colour in hex
*/
function randomHex() {
	return "#" + Math.round(0xffffff * Math.random()).toString(16);
}

function Line(startX, startY, raphael, index, isInput) {
    var start = {
        x: startX,
        y: startY
    },
	end = {
        x: startX,
        y: startY
    }, 
	getPath = function() {
        return "M" + start.x + " " + start.y + " L" + end.x + " " + end.y;
    },
	redraw = function() {
        node.attr("path", getPath());
    },
	route,
	node = raphael.path(getPath());
	node.attr({"stroke": randomHex(), "stroke-width": 2});
	node.dblclick(function() {
		Webtop.route.destroy(route[0], route[1]);
	});
	
    return {
        updateStart: function(x, y) {
            start.x = x;
            start.y = y;
            redraw();
            return this;
        },
        updateEnd: function(x, y) {
            end.x = x;
            end.y = y;
            redraw();
            return this;
        },
		destroy: function() {
			node.remove();
		},
		getIndex: function() {
			return index;
		},
		isInput: function() {
			return isInput;
		},
		setRoute: function(r) {
			route = r;
		}
    };
};

window.Webtop = Webtop;
})(jQuery, window);