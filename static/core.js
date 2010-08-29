(function($, window, undefined) {

/**
* Webtop Namespace
* uses closure for private members
*/
var Webtop = (function() {
		//Private methods and properties
		var tasks = [], //array of current tasks
			handlers = [], //array of event handlers
			z = 0, //z-index counter
			guid = 1, //unique ID for general use
			doc = window.document,
			PX = "px",
			pint = parseInt,
			canvas, //Raphael
			routes = [], //Array of app associations or 'routes'
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
			$(doc.body).bind("selectstart", function(evt) { evt.preventDefault(); });
			canvas = new Raphael("canvas",0, 0, $(window).width(), $(window).height());
			$("#canvas").mousedown(function(e) {
				x = e.offsetX;
				y = e.offsetY;
				line = new Line(x, y, x, y, canvas);
				$("#canvas").bind('mousemove', function(e) {
					x = e.offsetX;
					y = e.offsetY;
					line.updateEnd(x, y);
				});
			});

			$("#canvas").mouseup(function(e) {
				$("#canvas").unbind('mousemove');
			});
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
					}
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
					input, //connector nodes
					output;
				
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
						div({"class": "window-header"},
							strong(options.title), 
							span(a({"class": "min"},"[-]"),a({"class": "max"},"[_]"),a({"class": "close"},"[x]")))
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
				
				$(iframe).attr({frameBorder: '0', allowTransparency: 'true', src: options.src  }).hide();
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
				var _preventDefault = function(evt) { evt.preventDefault(); },
					startGhost = function(context) { $iframe.hide(); $(context).addClass("drag"); },
					stopGhost = function(context) { $iframe.show(); $(context).removeClass("drag"); };
				$("div.window-header", obj)
					.bind("dragstart", _preventDefault)
					.bind("selectstart", _preventDefault)
					.bind("mousedown", function() { controls.focus(); })
					.dblclick(function() { controls.maximize(); });
				
				//Add route bubbles
				if(options.route !== false) {
					//Beware: Pixel precision magic numbers
					input = canvas.circle(pint($obj.css("left"))-2,pint($obj.css("top"))+12,5);
					input.attr({'stroke': '#8A5B00', 'stroke-width': 1, 'fill': '#FFA800'});
					input.mousedown(function(e) {
						console.log(e);
					});
					
					output = canvas.circle(pint($obj.css("left"))+pint($obj.css("width"))+4,pint($obj.css("top"))+12,5);
					output.attr({'stroke': '#005080', 'stroke-width': 1, 'fill': '#00A2FF'});
				}
				
				
				if(options.draggable !== false) {
					$obj.draggable({handle: "div.window-header", scroll:false, containment:'document',
						start: function() {
							startGhost(this);
							input.attr({opacity: 0});
							output.attr({opacity: 0});
						},
						
						drag: function(e) {
							
						},
						
						stop: function() {
							stopGhost(this);
							//update the position of the task
							var co = [pint($(this).css("left")), pint($(this).css("top")), $(this).width()];
							
							tasks[index].dim.x = co[0];
							tasks[index].dim.y = co[1];
							
							input.attr({cx: co[0] - 2, cy: co[1] + 12, opacity: 1});
							output.attr({cx: co[0] + co[2] + 4, cy: co[1] + 12, opacity: 1});
							
						}
					});
				}
				
				if(options.resizable !== false) {
					$obj.resizable({containment:'document', autoHide: true, alsoResize: inner,
						start: function() {
							startGhost(this);
							if(tasks[index].state === Webtop.c('MAXIMIZED')) {
								controls.maximize();
							}
						}, 
						stop: function() {
							stopGhost(this);
							//update the dimensions of the task
							tasks[index].dim.w = $(this).css("width");
							tasks[index].dim.h = parseInt($(this).css("height"),10);
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
							attached.handler.call(attached.obj);
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

function Line(startX, startY, endX, endY, raphael) {
    var start = {
        x: startX,
        y: startY
    };
    var end = {
        x: endX,
        y: endY
    };
    var getPath = function() {
        return "M" + start.x + " " + start.y + " L" + end.x + " " + end.y;
    };
    var redraw = function() {
        node.attr("path", getPath());
    }

    var node = raphael.path(getPath());
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
        }
    };
};

window.Webtop = Webtop;
})(jQuery, window);